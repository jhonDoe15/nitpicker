import { Sequelize } from 'sequelize';
import { prisma, producer, saveOrder, publish, saveAndPublish } from './store';
declare const sequelize: Sequelize;
export async function run(id: string) { const rows = await prisma.order.findMany({ where: { id } }); rows.forEach(async () => { await producer.send({ topic: 'o', messages: [id] }); await prisma.order.update({ where: { id }, data: {} }); }); }