import cron from 'node-cron';
cron.schedule('* * * * *', async () => { for (const workspace of workspaces) { await workspaceRepository.update(workspace.id, {}); } });
export {};
