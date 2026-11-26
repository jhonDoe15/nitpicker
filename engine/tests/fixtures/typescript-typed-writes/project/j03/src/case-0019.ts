import { Processor, WorkerHost } from '@nestjs/bullmq';
class J extends WorkerHost { async other(ws) { for (const w of ws) { await this.workspaceRepository.update(w.id, {}); } } }
export {};
