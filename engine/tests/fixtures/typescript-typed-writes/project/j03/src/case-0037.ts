import { Cron } from '@nestjs/schedule';
class J { @Cron("* * * * *") async run(ws) { for (const w of ws) { const f = async () => { try { await this.workspaceRepository.update(w.id, {}); } catch (e) {} }; await this.workspaceRepository.update(w.id, {}); } } }
export {};
