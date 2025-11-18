import { customerCreate } from '../schemas/customers.js';

export default async function (app) {
  app.addHook('preHandler', app.auth);

  app.get('/', async (req) => {
    return app.prisma.customer.findMany({ orderBy: { id: 'desc' } });
  });

  app.post('/', async (req, reply) => {
    const parsed = customerCreate.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(parsed.error);
    return app.prisma.customer.create({ data: parsed.data });
  });

  app.get('/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const item = await app.prisma.customer.findUnique({ where: { id } });
    if (!item) return reply.code(404).send({ error: 'Not found' });
    return item;
  });
}
