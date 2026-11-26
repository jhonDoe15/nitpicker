import { Sequelize } from 'sequelize';
import { prisma, producer, saveOrder, publish, saveAndPublish } from './store';
import Redis from 'ioredis';
declare const sequelize: Sequelize;
declare const redis: Redis;
declare const items: string[];
export const handler = async (id: string) => { await saveOrder(id); await producer.send({ topic: 'o', messages: [id] }); };
export const other = async (id: string) => { await saveOrder(id); await publish(id); };