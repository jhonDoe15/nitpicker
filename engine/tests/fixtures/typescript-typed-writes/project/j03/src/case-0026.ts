import cron from 'node-cron';
cron.other('* * * * *', async () => { for (const w of ws) { await this.workspaceRepository.update(w.id, {}); } });
export {};
