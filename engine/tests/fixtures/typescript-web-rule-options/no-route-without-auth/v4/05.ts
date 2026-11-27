import Fastify from 'fastify';
const app = Fastify();
app.get('/orders', { preHandler: requireAuth }, async () => {});