import { Sequelize } from 'sequelize';
import { prisma, producer, saveOrder, publish, saveAndPublish } from './store';
declare const sequelize: Sequelize;
export async function both(id: string) { await saveOrder(id); await publish(id); }
export async function caller(id: string) { await both(id); }