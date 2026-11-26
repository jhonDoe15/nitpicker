import { Processor, WorkerHost } from '@nestjs/bullmq';
const K = @Processor('q') class { async process(ws) { for (const w of ws) { await this.workspaceRepository.update(w.id, {}); } } };
export {};
