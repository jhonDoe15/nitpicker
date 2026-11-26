import { Queue } from 'bullmq';
import { Cron } from '@nestjs/schedule';
class J { @Cron('* * * * *') async run(workspaces) { for (const workspace of workspaces) { await this.queue.add('sync', workspace); } } }
export {};
