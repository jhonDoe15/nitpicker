import { Producer } from 'kafkajs';
declare const producer: Producer;
export async function sendOrder(id: string) { await producer.send({ topic: 'orders', messages: [id] }); }
