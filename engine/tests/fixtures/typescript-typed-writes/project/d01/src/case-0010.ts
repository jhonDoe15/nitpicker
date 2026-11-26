import { send } from 'kafkajs';
export async function run(order) { await orderRepository.save(order); await send(order); }
export {};
