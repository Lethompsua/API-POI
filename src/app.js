import Fastify from 'fastify';
import { Server } from 'socket.io';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import dotenv from 'dotenv';
import multipart from '@fastify/multipart'; // <-- IMPORTA ESTO
import uploadRoutes from './routes/upload.js'; // <-- IMPORTA ESTO
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
await app.register(multipart);


// RUTAS
app.register(authRoutes, { prefix: '/auth' });
app.register(userRoutes, { prefix: '/users' });
app.register(chatRoutes, { prefix: '/chat' });
app.register(groupRoutes, { prefix: '/groups' });
app.register(taskRoutes, { prefix: '/tasks' });
app.register(rewardRoutes, { prefix: '/rewards' });
app.register(uploadRoutes, { prefix: '/upload' }); 


await app.ready();

// --- PASO 3: AÑADIR SOCKET.IO A LA APP EXISTENTE ---
// --- PASO 3: AÑADIR SOCKET.IO A LA APP EXISTENTE ---
const io = new Server(app.server, {
    cors: { 
        origin: "https://frontend-poi.vercel.app",
        methods: ["GET", "POST"]
    }
});
console.log('Socket.io server running');

const userSocketMap = new Map();

io.on('connection', (socket) => {
    
    console.log('socket connected:', socket.id, 'from', socket.handshake.address);
    socket.emit('whoami', { socketId: socket.id });

    // 1. Autenticación (¡Seguro!)
    socket.on('authenticate', (userId) => {
        if (userId) {
            const key = String(userId);
            console.log(`Usuario ${key} se autenticó con socket ${socket.id}`);
            userSocketMap.set(key, socket.id);
        } else {
            console.log('authenticate sin userId recibido desde', socket.id);
        }
    });

    // 2. Iniciar llamada (¡Seguro!)
    socket.on('start-call-with-offer', (payload, ack) => {
        // ▼▼▼ ¡AÑADIDO! Comprobación de seguridad
        if (!payload || !payload.otherUserId || !payload.offer) {
            console.error('Payload inválido en "start-call-with-offer"');
            if (typeof ack === 'function') ack({ ok: false, reason: 'invalid-payload' });
            return;
        }
        // ▲▲▲
        
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

    // 3. Respuesta (¡Seguro!)
    socket.on('answer', (payload) => {
        // ▼▼▼ ¡AÑADIDO! Comprobación de seguridad
        if (!payload || !payload.callerSocketId || !payload.answer) {
            console.error('Payload inválido en "answer"');
            return;
        }
        // ▲▲▲
        
        console.log(`Retransmitiendo respuesta a ${payload.callerSocketId}`);
        io.to(payload.callerSocketId).emit('answer-received', payload);
    });

    // 4. Candidatos ICE (¡Seguro!)
    socket.on('ice-candidate', (payload) => {
        // ▼▼▼ ¡AÑADIDO! Comprobación de seguridad
        if (!payload || (!payload.targetSocketId && !payload.targetUserId) || !payload.candidate) {
            console.error('Payload inválido en "ice-candidate"');
            return;
        }
        // ▲▲▲

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

    // 5. Desconexión (¡Seguro!)
    socket.on('disconnect', () => {
        for (let [userId, socketId] of userSocketMap.entries()) {
            if (socketId === socket.id) {
                userSocketMap.delete(userId);
                console.log(`Usuario ${userId} (socket ${socket.id}) se desconectó.`);
                break;
            }
        }
    });
    
    // 6. (Opcional) Capturador de errores
    socket.on('error', (err) => {
        console.error(`Socket Error: ${err.message}`);
    });

    // A. Unirse a una sala de Grupo
    socket.on('join-group', (groupId) => {
        const roomName = `group-${groupId}`;
        socket.join(roomName);
        console.log(`Socket ${socket.id} se unió al grupo ${roomName}`);
    });

    
    // B. Enviar mensaje de Chat (GUARDANDO EN BD DIRECTAMENTE)
    socket.on('send-chat-message', async (payload) => {
        // payload = { receptorId, grupoId, mensaje, tipo, ID_Emisor, Nombre }
        
        console.log("Procesando mensaje vía Socket:", payload);

        try {
            // 1. GUARDAR EN BASE DE DATOS (Desde el Socket)
            // Usamos app.db que ya está configurado en Fastify
            await app.db.query(
                `INSERT INTO chat (ID_Emisor, ID_Receptor, ID_Grupo, Mensaje, Tipo, Entregado) 
                 VALUES (?, ?, ?, ?, ?, 1)`,
                [
                    payload.ID_Emisor, 
                    payload.receptorId || null, 
                    payload.grupoId || null, 
                    payload.mensaje, 
                    payload.tipo || 'texto'
                ]
            );
            console.log("Mensaje guardado en BD vía Socket.");

            // 2. REENVIAR AL DESTINATARIO (Broadcast)
            if (payload.grupoId) {
                // Mensaje de Grupo
                socket.broadcast.to(`group-${payload.grupoId}`).emit('receive-chat-message', payload);
            } else if (payload.receptorId) {
                // Mensaje Privado
                const targetKey = String(payload.receptorId);
                const targetSocketId = userSocketMap.get(targetKey);
                
                if (targetSocketId) {
                    io.to(targetSocketId).emit('receive-chat-message', payload);
                }
            }

        } catch (error) {
            console.error("Error guardando mensaje en Socket:", error);
            // Opcional: Avisar al emisor que hubo un error
            socket.emit('message-error', { error: 'No se pudo guardar el mensaje' });
        }
    });

});

const PORT = process.env.PORT || 3000;
app.listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log(`Server running on ${PORT}`))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

