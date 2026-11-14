import { mkdtempSync, rmSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import path from 'node:path';
import { createWeightedSemaphore } from '../../../diff/execution/capacity.mts';
import { projectHeading } from '../../report/console.mjs';
import { outcomeOf } from '../../report/outcome.mjs';
import { type Finished, launchProject } from './launch.mts';
import {
  clearReports,
  failedOutcome,
  runRow,
  type RunContext,
  type SelectedRun,
  selectedRunOf,
} from './project-rows.mts';
import type { ProjectJob } from './project-job.mts';
import type { MonorepoCli, ProjectOutcome, ProjectRow } from '../../project-types.mts';

const CPUS_PER_PROJECT = 4;
const WORKER_SCRIPT = path.join(import.meta.dirname, 'project-worker.mts');

type InOrder = (index: number, write: () => void) => void;

function parallelJobs(rows: readonly ProjectRow[], cli: MonorepoCli): number {
  const selected = rows.filter(({ selection }) => selection.selected).length;
  const inProcess = cli.analyzers !== undefined && cli.projectWorker === undefined;
  const wanted = cli.options.jobs ?? Math.floor(availableParallelism() / CPUS_PER_PROJECT);
  return inProcess ? 1 : Math.max(1, Math.min(selected, wanted));
}

function inOrder(): InOrder {
  const waiting = new Map<number, () => void>();
  let next = 0;
  return (index, write) => {
    waiting.set(index, write);
    for (let ready = waiting.get(next); ready !== undefined; ready = waiting.get(next)) {
      waiting.delete(next);
      next += 1;
      ready();
    }
  };
}

function colorEnvironment(cli: MonorepoCli): NodeJS.ProcessEnv {
  const terminal = 'isTTY' in cli.stdout && cli.stdout.isTTY === true;
  const decided = process.env['NO_COLOR'] !== undefined || process.env['FORCE_COLOR'] !== undefined;
  return terminal && !decided ? { ...process.env, FORCE_COLOR: '1' } : process.env;
}

function jobOf(context: RunContext, run: SelectedRun, resultFile: string): ProjectJob {
  const { cli } = context;
  return {
    input: {
      arguments_: cli.arguments_,
      environment: cli.environment,
      interactive: cli.interactive,
      workingDirectory: cli.workingDirectory,
    },
    indexFile: cli.indexFile,
    scope: cli.scope,
    options: { ...cli.options, ...run.extras.options, outputRoot: run.reportRoot },
    extraCli: run.extras.cli,
    resultFile,
  };
}

function writeFinished(row: ProjectRow, context: RunContext, finished: Finished): void {
  const { cli } = context;
  cli.stdout.write(`${projectHeading(row.project)}${finished.stdout}`);
  cli.stderr.write(finished.stderr);
  if (finished.error !== undefined) {
    cli.stderr.write(`nitpicker failed in ${row.project.path}: ${finished.error}\n`);
  }
}

function outcomeOfFinished(row: ProjectRow, run: SelectedRun, finished: Finished): ProjectOutcome {
  return finished.error === undefined
    ? outcomeOf({ exitCode: finished.exitCode, reportRoot: run.reportRoot, error: undefined })
    : failedOutcome(row.project, run.reportRoot, finished.error);
}

type Pool = {
  readonly context: RunContext;
  readonly acquire: () => Promise<() => void>;
  readonly ordered: InOrder;
  readonly resultsRoot: string;
};

async function runInPool(row: ProjectRow, index: number, pool: Pool): Promise<ProjectRow> {
  const { context, ordered } = pool;
  const run = selectedRunOf(row, context);
  clearReports(run.reportRoot);
  if (!row.selection.selected) {
    ordered(index, () => undefined);
    return row;
  }
  const release = await pool.acquire();
  const label = row.project.path;
  context.cli.progress.write(`nitpicker: [${label}] started\n`);
  const finished = await launchProject({
    label,
    job: jobOf(context, run, path.join(pool.resultsRoot, `${String(index)}.json`)),
    workerScript: context.cli.projectWorker ?? WORKER_SCRIPT,
    environment: colorEnvironment(context.cli),
    progress: context.cli.progress,
  }).finally(release);
  const outcome = outcomeOfFinished(row, run, finished);
  ordered(index, () => {
    writeFinished(row, context, finished);
  });
  return { ...row, outcome };
}

async function runRowsInParallel(
  rows: readonly ProjectRow[],
  context: RunContext,
  jobs: number,
): Promise<readonly ProjectRow[]> {
  const semaphore = createWeightedSemaphore(jobs);
  const resultsRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-projects-'));
  const pool: Pool = {
    context,
    acquire: () => semaphore.acquire(1),
    ordered: inOrder(),
    resultsRoot,
  };
  try {
    return await Promise.all(rows.map((row, index) => runInPool(row, index, pool)));
  } finally {
    rmSync(resultsRoot, { recursive: true, force: true });
  }
}

export function runRows(
  rows: readonly ProjectRow[],
  context: RunContext,
): readonly ProjectRow[] | Promise<readonly ProjectRow[]> {
  const jobs = parallelJobs(rows, context.cli);
  return jobs > 1
    ? runRowsInParallel(rows, context, jobs)
    : rows.map((row) => runRow(row, context));
}
