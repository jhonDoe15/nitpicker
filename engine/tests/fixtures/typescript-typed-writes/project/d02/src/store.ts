import { PrismaClient } from '@prisma/client';
import { Producer } from 'kafkajs';
export const prisma = new PrismaClient();
export declare const producer: Producer;
export async function saveOrder(id: string) { await prisma.order.create({ data: { id } }); }
export async function publish(id: string) { await producer.send({ topic: 'o', messages: [id] }); }
export async function saveAndPublish(id: string) { await saveOrder(id); await publish(id); }
