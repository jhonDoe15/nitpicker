import express from 'express';
const app = express();
app.use(requireAuth);
app.get('/orders', (req, res) => {});