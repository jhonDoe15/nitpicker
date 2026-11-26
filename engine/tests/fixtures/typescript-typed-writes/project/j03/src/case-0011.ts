import { Cron } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(ws) { for (const w of ws) { for (const z of w) { try { await this.workspaceRepository.update(w.id, {}); } catch (e) { this.log(e); } } } } }
export {};
