import { Cron as C } from '@nestjs/schedule';
class J { @C() async run(ws) { for (const w of ws) { await this.workspaceRepository.update(w.id, {}); } } }
export {};
