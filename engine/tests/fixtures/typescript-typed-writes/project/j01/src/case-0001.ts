import { Cron, Interval, Timeout } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run() { const workspaces = await this.repo.find(); for (const workspace of workspaces) { try { await this.workspaceRepository.update(workspace.id, {}); } catch (error) { this.logger.error(error); } } } }
export {};
