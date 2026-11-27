import { Worker } from 'node:worker_threads';
beforeAll(() => { worker = new Worker('./server.js'); });