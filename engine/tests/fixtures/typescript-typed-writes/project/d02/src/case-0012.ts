import { Sequelize } from 'sequelize';
import { prisma, producer, saveOrder, publish, saveAndPublish } from './store';
declare const sequelize: Sequelize;
export async function run(id: string) { await prisma.order.findMany({ where: { id } }); await producer.send({ topic: 'o', messages: [id] }); }