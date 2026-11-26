import { Cron } from '@nestjs/schedule';
import { syncWorkspace } from './store';
export class Job { @Cron('* * * * *') async run(ids: string[]) { for (const id of ids) { console.log(id); } } }