import { Cron } from '@nestjs/schedule';
import { syncWorkspace } from './store';
export class Job { @Cron('* * * * *') async run(ids: string[]) { for (const id of ids) { try { await syncWorkspace(id); } catch (error) { console.error(error); } } } }