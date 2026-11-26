import { Producer } from 'kafkajs';
declare const producer: Producer;
export async function sendOrder(id: string) { await producer.send({ topic: 'orders', messages: [id] }); }
export class Sender { async send(id: string) { await producer.send({ topic: 'orders', messages: [id] }); } }
export async function readOrder(id: string) { return id; }
