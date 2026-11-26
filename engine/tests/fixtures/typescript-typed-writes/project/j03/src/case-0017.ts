import { Processor, Process } from '@nestjs/bull';
class J { async process(ws) { for (const w of ws) { await this.workspaceRepository.update(w.id, {}); } } }
export {};
