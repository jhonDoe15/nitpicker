import { Sequelize } from 'sequelize';
import { prisma, producer, saveOrder, publish, saveAndPublish } from './store';
declare const sequelize: Sequelize;
export async function run(id: string) { const later = async () => { await producer.send({ topic: 'o', messages: [id] }); }; await saveOrder(id); return later; }