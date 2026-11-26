import { Cron } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(ws) { for (const w of ws) { try { await this.a(); } catch (e) { this.log(e); } await this.workspaceRepository.update(w.id, {}); } } }
export {};
