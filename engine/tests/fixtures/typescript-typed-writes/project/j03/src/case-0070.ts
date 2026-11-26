import { Interval, Timeout } from '@nestjs/schedule';
class J { @Timeout(5) async run(ws) { for (const w of ws) { await this.workspaceRepository.update(w.id, {}); } } }
export {};
