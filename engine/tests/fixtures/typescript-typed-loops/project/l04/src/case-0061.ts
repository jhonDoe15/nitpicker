import { producer } from 'kafkajs'; for (const row of await outboxRepository.find()) { await producer.send(row); await outboxRepository.update(row.id, { sent: true }); }
export {};
