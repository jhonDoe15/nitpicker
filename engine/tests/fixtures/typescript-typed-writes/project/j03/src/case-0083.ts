import { schedule } from 'node-cron';
schedule('* * * * *', async () => { for (const w of ws) { await this.workspaceRepository.update(w.id, {}); } });
export {};
