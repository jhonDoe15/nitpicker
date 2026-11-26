import { Sequelize } from 'sequelize';
import { prisma, producer, saveOrder, publish, saveAndPublish } from './store';
import Redis from 'ioredis';
declare const sequelize: Sequelize;
declare const redis: Redis;
declare const items: string[];
export async function run(id: string) { const row = await prisma.order.findFirst({ where: { id } }); const copy = row; await producer.send({ topic: 'o', messages: [copy] }); await prisma.order.update({ where: { id }, data: { copy } }); }