const cron = require('node-cron');
cron.schedule('* * * * *', async () => { for (const w of ws) { await this.workspaceRepository.update(w.id, {}); } });
export {};
