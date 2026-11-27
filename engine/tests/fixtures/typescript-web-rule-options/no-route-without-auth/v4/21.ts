import express from 'express';
const app = express();
function mount(app: Express) { app.get('/orders', (req, res) => {}); }