import express from 'express';
const app = express();
app.use('/api', requireAuth);
app.post('/api/orders', (req, res) => {});