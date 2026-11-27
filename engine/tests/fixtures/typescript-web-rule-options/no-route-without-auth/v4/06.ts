import Fastify from 'fastify';
const app = Fastify();
app.addHook('onRequest', requireAuth);
app.get('/orders', async () => {});