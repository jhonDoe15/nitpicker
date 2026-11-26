import { Processor, WorkerHost } from '@nestjs/bullmq';
@Processor("sync") class J extends WorkerHost { async process(job) { for (const workspace of workspaces) { await this.workspaceRepository.update(workspace.id, { synced: true }); } } }
export {};
