import { Sequelize } from 'sequelize';
import { prisma, producer, saveOrder, publish, saveAndPublish } from './store';
import Redis from 'ioredis';
declare const sequelize: Sequelize;
declare const redis: Redis;
declare const items: string[];
export async function run(id: string) { await saveOrder(id); const t = await sequelize.transaction(); t.afterCommit(() => { void producer.send({ topic: 'o', messages: [id] }); }); await t.commit(); }