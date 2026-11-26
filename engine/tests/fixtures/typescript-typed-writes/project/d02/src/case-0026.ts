import { Sequelize } from 'sequelize';
import { prisma, producer, saveOrder, publish, saveAndPublish } from './store';
declare const sequelize: Sequelize;
export async function run(id: string) { const t = await sequelize.transaction(); await saveOrder(id); t.afterCommit(async () => { await producer.send({ topic: 'o', messages: [id] }); }); await t.commit(); }