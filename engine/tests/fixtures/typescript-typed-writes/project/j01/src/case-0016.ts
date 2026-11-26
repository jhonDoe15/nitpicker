import { Cron, Interval, Timeout } from '@nestjs/schedule';
class J { @Timeout(1000) async run(workspaces) { for (const workspace of workspaces) { await this.workspaceRepository.update(workspace.id, { synced: true }); } } }
export {};
