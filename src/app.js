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

// --- 1. CREAR APP FASTIFY ---
const app = Fastify({ logger: true });

// --- 2. CONFIGURAR BASE DE DATOS Y PLUGINS ---
app.decorate('db', await makePool());

// CORS: Permite que tu frontend en Vercel hable con este backend
await app.register(cors, { 
    origin: 'https://frontend-poi.vercel.app', // ¡Asegúrate que esta URL sea exacta!
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
});

await app.register(authPlugin);
await app.register(multipart);

// Swagger (Documentación)
await app.register(swagger, {
    openapi: {
        info: { title: 'FIFA Simple API', version: '1.0.0' },
        components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } }
    }
});
await app.register(swaggerUI, { routePrefix: '/docs' });

// --- 3. REGISTRAR RUTAS ---
app.register(authRoutes, { prefix: '/auth' });
app.register(userRoutes, { prefix: '/users' });
app.register(chatRoutes, { prefix: '/chat' });
app.register(groupRoutes, { prefix: '/groups' });
app.register(taskRoutes, { prefix: '/tasks' });
app.register(rewardRoutes, { prefix: '/rewards' });
app.register(uploadRoutes, { prefix: '/upload' });

// Espera a que Fastify esté listo antes de iniciar Socket.IO
await app.ready();

// --- 4. CONFIGURAR SOCKET.IO ---
const io = new Server(app.server, {
    cors: {
        origin: "https://frontend-poi.vercel.app", // Mismo origen que arriba
        methods: ["GET", "POST"]
    }
});

console.log('Socket.io server running');

// Mapa para rastrear usuarios conectados: ID_Usuario -> Socket_ID
const userSocketMap = new Map();

io.on('connection', (socket) => {

    console.log('Socket conectado:', socket.id);

    // 1. AUTENTICACIÓN DEL SOCKET
    socket.on('authenticate', (userId) => {
        if (!userId) return;
        
        // Guardamos la relación ID -> Socket
        const key = String(userId);
        userSocketMap.set(key, socket.id);
        
        // Guardamos el ID dentro del socket para referencia rápida
        socket.data.userId = key;
        
        console.log(`Usuario ${key} asociado al socket ${socket.id}`);
    });

    // 2. VIDEOLLAMADA (SIMPLE-PEER)
    // Este evento maneja Ofertas, Respuestas y Candidatos ICE automáticamente
    socket.on("webrtc-signal", (payload) => {
        // payload = { to: TARGET_USER_ID, signal: SIGNAL_DATA }
        
        if (!payload || !payload.to || !payload.signal) {
            console.error("Signal inválida:", payload);
            return;
        }

        const targetUserId = String(payload.to);
        const targetSocketId = userSocketMap.get(targetUserId);
        const senderUserId = socket.data.userId; // Obtenido de la autenticación

        if (targetSocketId) {
            console.log(`📹 Video: Señal de ${senderUserId} -> ${targetUserId}`);
            
            // Enviamos la señal directamente al socket del destino
            io.to(targetSocketId).emit("webrtc-signal", {
                from: senderUserId, // Es vital que el receptor sepa quién llama
                signal: payload.signal
            });
        } else {
            console.warn(`⚠️ Fallo Video: Usuario ${targetUserId} no está conectado.`);
            // Opcional: Avisar al que llama que el otro no está disponible
            socket.emit('call-error', { message: 'El usuario no está disponible para videollamada.' });
        }
    });

    // 3. UNIRSE A SALAS DE GRUPO
    socket.on('join-group', (groupId) => {
        const room = `group-${groupId}`;
        socket.join(room);
        console.log(`Socket ${socket.id} entró a sala ${room}`);
    });

    // 4. CHAT (TEXTO E IMÁGENES) - CON PERSISTENCIA
    socket.on('send-chat-message', async (payload) => {
        // payload = { ID_Emisor, receptorId, grupoId, mensaje, tipo }
        console.log("Procesando mensaje:", payload);

        try {
            // A. Guardar en Base de Datos (MySQL en Railway)
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

            // B. Reenviar al Destinatario (Tiempo Real)
            if (payload.grupoId) {
                // Es mensaje de Grupo -> Enviar a la sala
                socket.broadcast.to(`group-${payload.grupoId}`).emit('receive-chat-message', payload);
            } else {
                // Es mensaje Privado -> Buscar socket del usuario
                const target = userSocketMap.get(String(payload.receptorId));
                if (target) {
                    io.to(target).emit('receive-chat-message', payload);
                }
            }

        } catch (err) {
            console.error("Error al guardar mensaje en BD:", err);
            socket.emit('message-error', { error: 'No se pudo guardar el mensaje' });
        }
    });

    // 5. DESCONEXIÓN
    socket.on('disconnect', () => {
        // Buscamos qué usuario era este socket y lo borramos del mapa
        for (let [userId, sockId] of userSocketMap.entries()) {
            if (sockId === socket.id) {
                userSocketMap.delete(userId);
                console.log(`Usuario ${userId} desconectado.`);
                break;
            }
        }
    });
});

// --- 5. INICIAR SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log(`Server running on port ${PORT}`))
  .catch(err => {
    app.log.error(err);
    process.exit(1);
  });