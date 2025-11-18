import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';

export default fp(async function (app) {
  await app.register(jwt, { secret: process.env.JWT_SECRET });
  app.decorate('auth', async (request, reply) => {
    try { await request.jwtVerify(); }
    catch { return reply.code(401).send({ error: 'Unauthorized' }); }
  });
});
