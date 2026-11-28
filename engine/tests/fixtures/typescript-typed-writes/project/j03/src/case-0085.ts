import cron from 'node-cron';
cron.schedule('* * * * *', async function () { for (const w of ws) { await this.workspaceRepository.update(w.id, {}); } }, { timezone: 'x' });
export {};
