import { Worker } from 'bullmq';
new Worker('sync', async (job) => { for (const workspace of job.data) { await fetch(workspace.url); } });
export {};
