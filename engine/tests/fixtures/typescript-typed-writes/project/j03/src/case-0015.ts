import { Cron } from 'other';
class J { @Cron('x') async run(ws) { for (const w of ws) { await this.workspaceRepository.update(w.id, {}); } } }
export {};
