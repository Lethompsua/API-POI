import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';

export default async function swagger(app) {
  await app.register(fastifySwagger, {
    openapi: {
      info: { title: 'POI API', version: '1.0.0' },
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
      security: [{ bearerAuth: [] }]
    }
  });
  await app.register(fastifySwaggerUI, { routePrefix: '/docs' });
}
