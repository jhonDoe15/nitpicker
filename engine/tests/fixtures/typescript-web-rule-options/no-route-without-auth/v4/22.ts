import Fastify from 'fastify';
const app = Fastify();
app.register(async (instance) => { instance.get('/orders', async () => {}); });