import { Cron, Interval, Timeout } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(workspaces) { for (const workspace of workspaces) { const handlers = () => this.workspaceRepository.update(workspace.id, {}); handlers; } } }
export {};
