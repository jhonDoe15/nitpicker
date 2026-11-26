import { Cron } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(ws) { for (const w of ws) { try { await this.workspaceRepository.update(w.id, {}); } catch (e) { this.log(e); throw e; } } } }
export {};
