import { Worker } from 'bullmq';
new Worker('q', async (job) => { for (const w of job.data) { await fetch(w); } try { await fetch(1); } catch {} });
export {};
