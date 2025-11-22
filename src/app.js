import Fastify from 'fastify';
import { Server } from 'socket.io';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import dotenv from 'dotenv';
import multipart from '@fastify/multipart';
import uploadRoutes from './routes/upload.js';
dotenv.config();

import { makePool } from './db.js';
import authPlugin from './auth.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import chatRoutes from './routes/chat.js';
import groupRoutes from './routes/groups.js';
import taskRoutes from './routes/tasks.js';
import rewardRoutes from './routes/rewards.js';

// --- CREAR APP ---
const app = Fastify({ logger: true });

// --- CONFIGURAR PLUGINS ---
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

// --- SOCKET.IO ---
const io = new Server(app.server, {
    cors: {
        origin: "https://frontend-poi.vercel.app",
        methods: ["GET", "POST"]
    }
});
console.log('Socket.io server running');

const userSocketMap = new Map();

// -------------------------------
//     SISTEMA SIMPLE-PEER ❤️
// -------------------------------
io.on('connection', (socket) => {

    console.log('Socket conectado:', socket.id);

    socket.emit('whoami', { socketId: socket.id });

    // Usuario autentica su ID
    socket.on('authenticate', (userId) => {
        if (!userId) return;
        userSocketMap.set(String(userId), socket.id);
        console.log(`Usuario ${userId} asociado al socket ${socket.id}`);
    });

    // 🔥 simple-peer usa SOLO ESTE EVENTO 🔥
    socket.on("webrtc-signal", ({ to, signal }) => {
        if (!to || !signal) {
            console.error("Signal inválida en webrtc-signal");
            return;
        }

        const targetSocketId = userSocketMap.get(String(to));
        if (!targetSocketId) {
            console.log(`Usuario ${to} no está conectado`);
            return;
        }

        io.to(targetSocketId).emit("webrtc-signal", {
            from: socket.data?.userId || socket.id,
            signal
        });
    });

    // -------------------------------
    // CHAT
    // -------------------------------
    socket.on('join-group', (groupId) => {
        const room = `group-${groupId}`;
        socket.join(room);
        console.log(`Socket ${socket.id} entró a sala ${room}`);
    });

    socket.on('send-chat-message', async (payload) => {
        try {
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

            if (payload.grupoId) {
                socket.broadcast.to(`group-${payload.grupoId}`)
                    .emit('receive-chat-message', payload);
            } else {
                const target = userSocketMap.get(String(payload.receptorId));
                if (target) io.to(target).emit('receive-chat-message', payload);
            }

        } catch (err) {
            console.error("Error al guardar mensaje:", err);
            socket.emit('message-error', { error: 'No se pudo guardar el mensaje' });
        }
    });

    socket.on('disconnect', () => {
        for (let [userId, sockId] of userSocketMap.entries()) {
            if (sockId === socket.id) {
                userSocketMap.delete(userId);
                console.log(`Usuario ${userId} desconectado.`);
                break;
            }
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
