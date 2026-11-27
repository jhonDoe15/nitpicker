import { producer } from 'kafkajs'; for (const id of ids) { await producer.send({ topic, messages: [id] }); }
export {};
