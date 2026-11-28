import { Worker } from 'bullmq';
new Worker('q', async function (job) { for (const w of ws) { await this.workspaceRepository.update(w.id, {}); } });
export {};
