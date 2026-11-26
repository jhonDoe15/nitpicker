import { Process } from '@nestjs/schedule';
class J { @Process() async run(ws) { for (const w of ws) { await this.workspaceRepository.update(w.id, {}); } } }
export {};
