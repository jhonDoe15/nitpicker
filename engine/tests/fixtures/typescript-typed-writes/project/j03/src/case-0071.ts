import { Cron } from '@nestjs/schedule';
class J { @Cron('x') static async run(ws) { for (const w of ws) { await this.workspaceRepository.update(w.id, {}); } } }
export {};
