import { Processor, Process } from '@nestjs/bull';
@Processor("sync") class J { @Process() async run(job) { for (const workspace of workspaces) { await this.workspaceRepository.update(workspace.id, { synced: true }); } } }
export {};
