import { Sequelize } from 'sequelize';
import { prisma, producer, saveOrder, publish, saveAndPublish } from './store';
import Redis from 'ioredis';
declare const sequelize: Sequelize;
declare const redis: Redis;
declare const items: string[];
export class Service { async publishOnly(id: string) { await publish(id); } async saveOnly(id: string) { await saveOrder(id); } }