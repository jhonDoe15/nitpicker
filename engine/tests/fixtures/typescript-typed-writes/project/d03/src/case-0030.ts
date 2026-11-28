import { Sequelize } from 'sequelize';
import { prisma, producer, saveOrder, publish, saveAndPublish } from './store';
import Redis from 'ioredis';
declare const sequelize: Sequelize;
declare const redis: Redis;
declare const items: string[];
export async function run(id: string) { await prisma.$transaction(async (tx) => { await tx.order.create({ data: { id } }); }); await producer.send({ topic: 'o', messages: [id] }); await prisma.order.create({ data: { id } }); }