import { Cron } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(ws) { for (const w of ws) { const x = async () => { await this.workspaceRepository.update(w.id, {}); }; x; } } }
export {};
