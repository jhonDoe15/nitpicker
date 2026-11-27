import express from 'express';
const app = express();
app.post('/webhooks/stripe', express.raw(), (req, res) => {});