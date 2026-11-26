import { Processor, WorkerHost } from '@nestjs/bullmq';
const K = class extends WorkerHost { async process(ws) { for (const w of ws) { await this.workspaceRepository.update(w.id, {}); } } };
export {};
