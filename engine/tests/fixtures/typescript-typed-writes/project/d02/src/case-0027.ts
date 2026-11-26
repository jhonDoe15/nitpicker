import { Sequelize } from 'sequelize';
import { prisma, producer, saveOrder, publish, saveAndPublish } from './store';
declare const sequelize: Sequelize;
export async function run(id: string) { await prisma.$transaction(async (tx) => { await tx.order.create({ data: { id } }); }); await producer.send({ topic: 'o', messages: [id] }); }