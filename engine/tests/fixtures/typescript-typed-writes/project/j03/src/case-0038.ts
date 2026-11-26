import { Cron } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(ws) { for (const w of ws) { await Promise.all([this.workspaceRepository.update(w.id, {})]); } } }
export {};
