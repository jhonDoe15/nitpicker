import { Sequelize } from 'sequelize';
import { prisma, producer, saveOrder, publish, saveAndPublish } from './store';
declare const sequelize: Sequelize;
export async function run(id: string) { const rows = await prisma.order.findMany({ where: { id } }); for (const row of rows) { await producer.send({ topic: 'o', messages: [row.id] }); await prisma.$executeRaw`update orders set sent = true where id = ${row.id}`; } }