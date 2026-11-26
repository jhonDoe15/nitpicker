import { Process } from '@nestjs/bullmq';
class J { @Process() async run(ws) { for (const w of ws) { await this.workspaceRepository.update(w.id, {}); } } }
export {};
