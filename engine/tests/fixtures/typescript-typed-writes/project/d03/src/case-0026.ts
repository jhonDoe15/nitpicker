import { Sequelize } from 'sequelize';
import { prisma, producer, saveOrder, publish, saveAndPublish } from './store';
import Redis from 'ioredis';
declare const sequelize: Sequelize;
declare const redis: Redis;
declare const items: string[];
export async function run(id: string) { items.forEach((item) => { prisma.order.create({ data: { id: item } }); }); await producer.send({ topic: 'o', messages: [id] }); }