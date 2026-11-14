import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { typedIoProject } from '../../test-support/typed-io-project.mjs';
import { rule } from './no-unisolated-job-loop.mjs';

const nest = "import { Cron, Interval, Timeout } from '@nestjs/schedule';\n";
const bull = "import { Processor, Process } from '@nestjs/bull';\n";
const bullmq = "import { Processor, WorkerHost } from '@nestjs/bullmq';\n";

const unisolatedLoop =
  'for (const workspace of workspaces) { await this.workspaceRepository.update(workspace.id, { synced: true }); }';

function invalid(code) {
  return { code, errors: [{ messageId: 'unisolated' }] };
}

typescriptRuleTester().run('no-unisolated-job-loop', rule, {
  valid: [
    `${nest}class J { @Cron("* * * * *") async run() { const workspaces = await this.repo.find(); for (const workspace of workspaces) { try { await this.workspaceRepository.update(workspace.id, {}); } catch (error) { this.logger.error(error); } } } }`,
    `${nest}class J { @Cron("* * * * *") async run(workspaces) { for (const workspace of workspaces) { await this.queue.add("sync", workspace); } } }`,
    "import { Queue } from 'bullmq';\nimport { Cron } from '@nestjs/schedule';\nclass J { @Cron('* * * * *') async run(workspaces) { for (const workspace of workspaces) { await this.queue.add('sync', workspace); } } }",
    `${nest}class J { @Cron("* * * * *") async run(workspaces) { for (const workspace of workspaces) { await Promise.allSettled([this.workspaceRepository.update(workspace.id, {})]); } } }`,
    `${nest}class J { @Cron("* * * * *") async run(workspaces) { for (const workspace of workspaces) { this.count += workspace.size; } } }`,
    `class J { async run(workspaces) { ${unisolatedLoop} } }`,
    `${nest}class J { async run(workspaces) { ${unisolatedLoop} } }`,
    `${nest}class J { @Cron("* * * * *") async run(workspaces) { await Promise.all(workspaces.map(async (workspace) => { await this.workspaceRepository.update(workspace.id, {}); })); } }`,
    `${nest}class J { @Cron("* * * * *") async run(workspaces) { for (const workspace of workspaces) { const handlers = () => this.workspaceRepository.update(workspace.id, {}); handlers; } } }`,
    `${nest}class J { @Cron("* * * * *") async run(workspaces) { for (const workspace of workspaces) { await this.workspaceRepository.update(workspace.id, {}).catch((error) => this.logger.error(error)); } } }`,
    `${nest}class J { @Cron("* * * * *") async run(workspaces) { for (const workspace of workspaces) { await this.workspaceRepository.update(workspace.id, {}).then(() => undefined, (error) => this.logger.error(error)); } } }`,
    `${nest}class J { @Cron("* * * * *") async run() { for (const step of ["a", "b"]) { await this.workspaceRepository.update(step, {}); } } }`,
  ].map((code) => ({ code })),
  invalid: [
    invalid(
      `${nest}class J { @Cron("* * * * *") async run(workspaces) { for (const workspace of workspaces) { await this.workspaceRepository.update(workspace.id, {}).catch((error) => { throw error; }); } } }`,
    ),
    invalid(`${nest}class J { @Cron("* * * * *") async run(workspaces) { ${unisolatedLoop} } }`),
    invalid(`${nest}class J { @Interval(1000) async run(workspaces) { ${unisolatedLoop} } }`),
    invalid(`${nest}class J { @Timeout(1000) async run(workspaces) { ${unisolatedLoop} } }`),
    invalid(
      `${bull}@Processor("sync") class J { @Process() async run(job) { ${unisolatedLoop} } }`,
    ),
    invalid(
      `${bullmq}@Processor("sync") class J extends WorkerHost { async process(job) { ${unisolatedLoop} } }`,
    ),
    invalid(
      `${bullmq}class J extends WorkerHost { async process(job) { for await (const workspace of this.stream()) { await fetch(workspace.url); } } }`,
    ),
    invalid(
      `import { Worker } from 'bullmq';\nnew Worker('sync', async (job) => { for (const workspace of job.data) { await fetch(workspace.url); } });`,
    ),
    invalid(
      `import Agenda from 'agenda';\nconst agenda = new Agenda();\nagenda.define('sync', async (job) => { for (const workspace of job.attrs.data) { await workspaceRepository.update(workspace.id, {}); } });`,
    ),
    invalid(
      `import cron from 'node-cron';\ncron.schedule('* * * * *', async () => { for (const workspace of workspaces) { await workspaceRepository.update(workspace.id, {}); } });`,
    ),
    invalid(
      `${nest}class J { @Cron("* * * * *") async run(workspaces) { for (const workspace of workspaces) { try { await this.workspaceRepository.update(workspace.id, {}); } catch (error) { throw error; } } } }`,
    ),
    invalid(
      `${nest}class J { @Cron("* * * * *") async run(workspaces) { try { for (const workspace of workspaces) { await this.workspaceRepository.update(workspace.id, {}); } } catch (error) { this.logger.error(error); } } }`,
    ),
    invalid(
      `${nest}class J { @Cron("* * * * *") async run(workspaces) { for (const workspace of workspaces) { try { await this.workspaceRepository.update(workspace.id, {}); } finally { this.done(); } } } }`,
    ),
  ],
});

const STORE = [
  "import { PrismaClient } from '@prisma/client';",
  'export const prisma = new PrismaClient();',
  'export async function syncWorkspace(id: string) { await prisma.order.update({ where: { id }, data: {} }); }',
].join('\n');
const { tester, typed } = typedIoProject('job-loop', STORE);
const HEADER =
  "import { Cron } from '@nestjs/schedule';\nimport { syncWorkspace } from './store';\n";

function run(loop) {
  return typed(
    `${HEADER}export class Job { @Cron('* * * * *') async run(ids: string[]) { ${loop} } }`,
  );
}

tester.run('no-unisolated-job-loop with types', rule, {
  valid: [
    run(
      'for (const id of ids) { try { await syncWorkspace(id); } catch (error) { console.error(error); } }',
    ),
    run('for (const id of ids) { console.log(id); }'),
  ],
  invalid: [
    {
      ...run('for (const id of ids) { await syncWorkspace(id); }'),
      errors: [{ messageId: 'unisolated' }],
    },
  ],
});
