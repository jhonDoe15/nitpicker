import { Cron } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(ws) { for (const w of [1, 2]) { await this.workspaceRepository.update(w.id, {}); } } }
export {};
