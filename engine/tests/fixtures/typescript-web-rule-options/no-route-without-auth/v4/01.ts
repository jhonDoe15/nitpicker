import express from 'express';
const app = express();
app.get('/orders', requireAuth, (req, res) => {});