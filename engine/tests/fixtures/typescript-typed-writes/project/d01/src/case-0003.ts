import { send } from 'kafkajs';
export async function run(order) { await orderRepository.findById(order); await send(order); }
export {};
