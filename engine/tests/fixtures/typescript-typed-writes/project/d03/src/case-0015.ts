import { Sequelize } from 'sequelize';
import { prisma, producer, saveOrder, publish, saveAndPublish } from './store';
import Redis from 'ioredis';
declare const sequelize: Sequelize;
declare const redis: Redis;
declare const items: string[];
export async function run(id: string) { const rows = await prisma.order.findMany({ where: { id } }); let i = 0; while (i < rows.length) { const row = rows[i]; await producer.send({ topic: 'o', messages: [row.id] }); await prisma.order.update({ where: { id: row.id }, data: {} }); i += 1; } }