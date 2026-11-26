import { send } from 'kafkajs';
export function routes(app) { app.post('/o', async (req) => { await orderRepository.save(req.body); }); app.post('/p', async (req) => { await send(req.body); }); }
export {};
