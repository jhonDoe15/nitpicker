import axios from 'axios';
import { Producer } from 'kafkajs';
declare const producer: Producer;
export async function notify(id: string) { await axios.post('/notify', { id }); }
export async function publish(id: string) { await producer.send({ topic: 'o', messages: [id] }); }
export function format(id: string) { return id.trim(); }
