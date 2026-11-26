import { Processor, WorkerHost } from '@nestjs/bullmq';
class J extends WorkerHost { async process(ws) { for (const w of ws) { await this.workspaceRepository.update(w.id, {}); } } }
export {};
