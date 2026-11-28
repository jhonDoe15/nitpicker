import { Cron, Interval, Timeout } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(workspaces) { for (const workspace of workspaces) { try { await this.workspaceRepository.update(workspace.id, {}); } catch (error) { throw error; } } } }
export {};
