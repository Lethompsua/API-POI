import Fastify from 'fastify';
import { Server } from 'socket.io';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import dotenv from 'dotenv';
dotenv.config();

import { makePool } from './db.js';
import authPlugin from './auth.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import chatRoutes from './routes/chat.js';
import groupRoutes from './routes/groups.js';
import taskRoutes from './routes/tasks.js';
import rewardRoutes from './routes/rewards.js';

// --- PASO 1: CREAR LA APP PRIMERO ---
const app = Fastify({ logger: true });

// --- PASO 2: REGISTRAR TODOS LOS PLUGINS Y RUTAS ---
app.decorate('db', await makePool());

await app.register(cors, { 
    origin: 'https://frontend-poi.vercel.app' 
});
await app.register(authPlugin);

await app.register(swagger, {
  openapi: {
    info: { title: 'FIFA Simple API', version: '1.0.0' },
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } }
  }
});
await app.register(swaggerUI, { routePrefix: '/docs' });

// RUTAS
app.register(authRoutes, { prefix: '/auth' });
app.register(userRoutes, { prefix: '/users' });
app.register(chatRoutes, { prefix: '/chat' });
app.register(groupRoutes, { prefix: '/groups' });
app.register(taskRoutes, { prefix: '/tasks' });
app.register(rewardRoutes, { prefix: '/rewards' });

// --- PASO 3: AÑADIR SOCKET.IO A LA APP EXISTENTE ---
const io = new Server(app.server, {
    cors: { 
        origin: "https://frontend-poi.vercel.app",
        methods: ["GET", "POST"]
    }
});
console.log('Socket.io server running');

// Mapa para rastrear: qué ID de usuario tiene qué ID de socket
// Map<userId, socketId>
const userSocketMap = new Map();

io.on('connection', (socket) => {
    console.log('socket connected:', socket.id, 'from', socket.handshake.address);
    // opcional: informa al cliente su socketId para debugging
    socket.emit('whoami', { socketId: socket.id });

    // 1. Cuando un usuario se conecta, nos dice quién es
    socket.on('authenticate', (userId) => {
        if (userId) {
            const key = String(userId);
            console.log(`Usuario ${key} se autenticó con socket ${socket.id}`);
            userSocketMap.set(key, socket.id);
        } else {
            console.log('authenticate sin userId recibido desde', socket.id);
        }
    });

    // 2. El que llama (A) envía su oferta AL OTRO USUARIO (B)
    socket.on('start-call-with-offer', (payload, ack) => {
        const targetKey = String(payload.otherUserId);
        const calleeSocketId = userSocketMap.get(targetKey);

        if (calleeSocketId) {
            console.log(`Retransmitiendo oferta de ${socket.id} a ${calleeSocketId}`);
            if (typeof ack === 'function') ack({ ok: true, targetSocketId: calleeSocketId });
            io.to(calleeSocketId).emit('offer-received', {
                callerSocketId: socket.id,
                offer: payload.offer
            });
        } else {
            console.log(`Usuario ${targetKey} no está conectado.`);
            if (typeof ack === 'function') ack({ ok: false, reason: 'target-offline' });
            socket.emit('call-error', { message: 'El usuario no está conectado.' });
        }
    });

    // fallback: aceptar evento 'offer' con targetUserId (cliente lo usa como fallback)
    socket.on('offer', (payload, ack) => {
        const targetKey = String(payload.targetUserId);
        const calleeSocketId = userSocketMap.get(targetKey);
        if (calleeSocketId) {
            console.log(`(fallback) reenviando offer de ${socket.id} a ${calleeSocketId}`);
            if (typeof ack === 'function') ack({ ok: true, targetSocketId: calleeSocketId });
            io.to(calleeSocketId).emit('offer-received', { callerSocketId: socket.id, offer: payload.offer });
        } else {
            if (typeof ack === 'function') ack({ ok: false, reason: 'target-offline' });
            socket.emit('call-error', { message: 'El usuario no está conectado.' });
        }
    });

    // 3. El que recibe (B) envía su respuesta DE VUELTA al que llamó (A)
    socket.on('answer', (payload) => {
        console.log(`Retransmitiendo respuesta a ${payload.callerSocketId}`);
        io.to(payload.callerSocketId).emit('answer-received', payload);
    });

    // 4. Intercambio de candidatos ICE (información de red)
    socket.on('ice-candidate', (payload) => {
        // soporta targetSocketId o targetUserId
        let target = payload.targetSocketId;
        if (!target && payload.targetUserId) target = userSocketMap.get(String(payload.targetUserId));
        if (target) {
            io.to(target).emit('ice-candidate-received', {
                candidate: payload.candidate,
                senderSocketId: socket.id
            });
        } else {
            console.warn('No se encontró target para ice-candidate:', payload);
        }
    });

    socket.on('disconnect', () => {
        for (let [userId, socketId] of userSocketMap.entries()) {
            if (socketId === socket.id) {
                userSocketMap.delete(userId);
                console.log(`Usuario ${userId} (socket ${socket.id}) se desconectó.`);
                break;
            }
        }
    });
});

// Conectar
const socket = io('https://tu-servidor', { transports: ['websocket'] });

// confirmar id de usuario al servidor
socket.on('connect', () => {
  socket.emit('authenticate', miUserId);
});

// al iniciar llamada: enviar oferta al otro usuario
// offer es el SDP generado por RTCPeerConnection.createOffer()
socket.emit('start-call-with-offer', { otherUserId: idDelOtro, offer }, (ack) => {
  console.log('ack start-call:', ack);
});

// recibir oferta entrante
socket.on('offer-received', async ({ callerSocketId, offer }) => {
  // setRemoteDescription, createAnswer, etc.
  // luego enviar answer incluyendo callerSocketId
  socket.emit('answer', { callerSocketId, answerSDP });
});
