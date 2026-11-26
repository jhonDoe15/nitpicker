import { send } from 'kafkajs';
export async function run(order) { const query = orderRepository.createQueryBuilder('o'); await send(query); }
export {};
