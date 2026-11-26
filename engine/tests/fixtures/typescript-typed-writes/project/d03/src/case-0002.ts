import { Sequelize } from 'sequelize';
import { prisma, producer, saveOrder, publish, saveAndPublish } from './store';
import Redis from 'ioredis';
declare const sequelize: Sequelize;
declare const redis: Redis;
declare const items: string[];
export async function run(id: string) { for (const row of await prisma.order.findMany()) { await producer.send({ topic: 'o', messages: [row.id] }); await prisma.order.update({ where: { id: row.id }, data: {} }); } }