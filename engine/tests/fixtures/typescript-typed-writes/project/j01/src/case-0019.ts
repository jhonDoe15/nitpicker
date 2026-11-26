import { Processor, WorkerHost } from '@nestjs/bullmq';
class J extends WorkerHost { async process(job) { for await (const workspace of this.stream()) { await fetch(workspace.url); } } }
export {};
