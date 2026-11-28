import { send } from 'kafkajs';
export function listen(bus) { bus.on('o', async (o) => { await orderRepository.save(o); }); bus.on('p', (o) => send(o)); }
export {};
