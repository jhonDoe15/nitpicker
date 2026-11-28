import { Cron, Interval, Timeout } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(workspaces) { for (const workspace of workspaces) { await Promise.allSettled([this.workspaceRepository.update(workspace.id, {})]); } } }
export {};
