import { Processor, WorkerHost } from '@nestjs/bullmq';
@Processor('q') class J { async process(ws) { for (const w of ws) { await this.workspaceRepository.update(w.id, {}); } } }
export {};
