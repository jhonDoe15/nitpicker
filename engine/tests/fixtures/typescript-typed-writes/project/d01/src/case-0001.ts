import { send } from 'kafkajs';
export async function run(order) { await send({ topic: 'o', messages: [order] }); }
export {};
