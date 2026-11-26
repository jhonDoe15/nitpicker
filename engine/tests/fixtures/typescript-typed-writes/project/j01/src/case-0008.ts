import { Cron, Interval, Timeout } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(workspaces) { await Promise.all(workspaces.map(async (workspace) => { await this.workspaceRepository.update(workspace.id, {}); })); } }
export {};
