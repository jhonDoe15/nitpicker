import { send } from 'kafkajs';
await orderRepository.save(order);
await send(order);
export {};
