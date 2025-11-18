import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export default async function prismaPlugin(app) {
  app.decorate('prisma', prisma);
  app.addHook('onClose', async () => prisma.$disconnect());
}
