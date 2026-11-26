import { send } from 'kafkajs';
export async function run(order) { await redis.set(order.id, 1); await send(order); }
export {};
