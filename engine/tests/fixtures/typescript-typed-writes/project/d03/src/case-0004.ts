import { Sequelize } from 'sequelize';
import { prisma, producer, saveOrder, publish, saveAndPublish } from './store';
import Redis from 'ioredis';
declare const sequelize: Sequelize;
declare const redis: Redis;
declare const items: string[];
export async function run(id: string) { const rows = await prisma.order.findMany({ where: { id } }); rows.forEach(async ({ id: rid }) => { await producer.send({ topic: 'o', messages: [rid] }); await prisma.order.update({ where: { id: rid }, data: {} }); }); }