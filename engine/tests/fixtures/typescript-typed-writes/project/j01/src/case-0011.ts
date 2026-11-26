import { Cron, Interval, Timeout } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(workspaces) { for (const workspace of workspaces) { await this.workspaceRepository.update(workspace.id, {}).then(() => undefined, (error) => this.logger.error(error)); } } }
export {};
