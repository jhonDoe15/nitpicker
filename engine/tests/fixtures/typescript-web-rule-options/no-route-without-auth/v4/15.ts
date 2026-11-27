import express from 'express';
const app = express();
const router = express.Router();
router.use(requireAuth);
if (enabled) { router.get('/a', (req, res) => {}); }