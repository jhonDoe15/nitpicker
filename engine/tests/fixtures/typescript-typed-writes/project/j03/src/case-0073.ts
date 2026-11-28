import { Worker } from 'bull';
new Worker('q', async (job) => { for (const w of ws) { await this.workspaceRepository.update(w.id, {}); } });
export {};
