import { Cron, Interval, Timeout } from '@nestjs/schedule';
class J { async run(workspaces) { for (const workspace of workspaces) { await this.workspaceRepository.update(workspace.id, { synced: true }); } } }
export {};
