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
// (Ahora 'app.server' SÍ existe)
const io = new Server(app.server, {
    cors: {
        origin: "*", // Permite todas las conexiones (ajusta esto en producción)
        methods: ["GET", "POST"]
    }
});
console.log('Socket.io server running');

io.on('connection', (socket) => {
    console.log(`Un usuario se conectó: ${socket.id}`);

    // Evento para unirse a una "sala" (la llamada)
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`Usuario ${socket.id} se unió a la sala ${roomId}`);
    });

    // Evento para retransmitir la "oferta" de llamada
    // Evento para retransmitir la "oferta" de llamada
    socket.on('offer', (payload) => {
      console.log("Retransmitiendo oferta...");
      socket.broadcast.to(payload.room).emit('offer', payload); // <-- Corregido
    });

// Evento para retransmitir la "respuesta"
    socket.on('answer', (payload) => {
      console.log("Retransmitiendo respuesta...");
      socket.broadcast.to(payload.room).emit('answer', payload); // <-- Corregido
    });

// Evento para retransmitir los "candidatos de red" (la info de red)
socket.on('ice-candidate', (payload) => {
    socket.broadcast.to(payload.room).emit('ice-candidate', payload); // <-- Corregido
});

    socket.on('disconnect', () => {
        console.log(`Un usuario se desconectó: ${socket.id}`);
    });
});

// --- PASO 4: INICIAR EL SERVIDOR (UNA SOLA VEZ) ---
app.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' }, (err, address) => {
    if (err) {
        app.log.error(err);
        process.exit(1);
    }
    // El logger de Fastify ya dice "Server listening at..."
});