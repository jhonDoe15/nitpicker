import { send } from 'kafkajs';
app.post('/o', async (req) => { await orderRepository.save(req.body); await send(req.body); });
export {};
