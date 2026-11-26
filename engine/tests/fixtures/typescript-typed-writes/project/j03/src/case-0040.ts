import { Cron } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(ws) { for (const w of ws) { return this.workspaceRepository.update(w.id, {}); } } }
export {};
