import { mkdtemp, rm } from 'node:fs/promises';
import { availableParallelism, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mts';
import {
  MEMORY_LIMIT_VARIABLE,
  machineMemory,
} from '../../../../shared/processes/machine-capacity.mts';
import { usableMemoryMegabytes } from '../../../../shared/processes/memory/node-heap.mts';
import { createWeightedSemaphore } from '../../../diff/execution/capacity.mts';
import { projectFilePaths } from '../../../../shared/project-files/project-files.mts';
import { projectHeading } from '../../report/console.mts';
import { outcomeOf } from '../../report/outcome.mts';
import { type Finished, type Launch, launchProject, type ProjectJob } from './launch.mts';
import {
  clearReports,
  failedOutcome,
  runRow,
  type RunContext,
  type SelectedRun,
  selectedRunOf,
} from './project-rows.mts';
import type { MonorepoCli, ProjectOutcome, ProjectRow } from '../../project-types.mts';

const CPUS_PER_PROJECT = 4;
const SMALL_PROJECT_FILES = 100;
const MEDIUM_PROJECT_FILES = 500;
const MIN_PROJECT_MEMORY_MIB = 4096;
const projectFiles: (root: string) => readonly string[] = projectFilePaths;
const WORKER_SCRIPT = fileURLToPath(
  checkoutModuleUrl(new URL('../../../project-worker.mjs', import.meta.url)),
);

type InOrder = (index: number, write: () => void) => void;

type Capacity = { readonly slots: number; readonly weightOf: (row: ProjectRow) => number };

export function projectSlots(
  availableCpus: number = availableParallelism(),
  usableMegabytes: number = usableMemoryMegabytes(),
): number {
  const byMemory = Math.max(1, Math.floor(usableMegabytes / MIN_PROJECT_MEMORY_MIB));
  return Math.max(1, Math.min(availableCpus, byMemory));
}

export function workerEnvironment(
  base: NodeJS.ProcessEnv,
  {
    weight,
    slots,
    memoryBytes = machineMemory(),
  }: { readonly weight: number; readonly slots: number; readonly memoryBytes?: number },
): NodeJS.ProcessEnv {
  const shareBytes = Math.max(1, Math.floor((memoryBytes * weight) / slots));
  return {
    ...base,
    ...(base['NITPICKER_MAX_PARALLEL'] === undefined
      ? { NITPICKER_MAX_PARALLEL: String(Math.max(1, weight)) }
      : {}),
    [MEMORY_LIMIT_VARIABLE]: String(shareBytes),
  };
}

function sizedWeight(row: ProjectRow, slots: number): number {
  const files = projectFiles(row.project.absolute).length;
  if (files <= SMALL_PROJECT_FILES) {
    return 1;
  }
  return Math.min(slots, files <= MEDIUM_PROJECT_FILES ? 2 : CPUS_PER_PROJECT);
}

function capacityOf(rows: readonly ProjectRow[], cli: MonorepoCli): Capacity {
  const selected = rows.filter(({ selection }) => selection.selected);
  const inProcess = cli.analyzers !== undefined && cli.projectWorker === undefined;
  if (inProcess || selected.length < 2) {
    return { slots: 1, weightOf: () => 1 };
  }
  if (cli.options.jobs !== undefined) {
    return { slots: Math.max(1, Math.min(selected.length, cli.options.jobs)), weightOf: () => 1 };
  }
  const slots = projectSlots();
  const weights = new Map(selected.map((row) => [row, sizedWeight(row, slots)]));
  const [lightest = slots, next = slots] = [...weights.values()].toSorted((a, b) => a - b);
  return lightest + next > slots
    ? { slots: 1, weightOf: () => 1 }
    : { slots, weightOf: (row) => weights.get(row) ?? slots };
}

function inOrder(): InOrder {
  const waiting = new Map<number, () => void>();
  let next = 0;
  function flush(): void {
    const ready = [...waiting.keys()].toSorted((left, right) => left - right);
    for (const index of ready) {
      const write = waiting.get(index);
      if (index !== next || write === undefined) {
        return;
      }
      waiting.delete(index);
      next += 1;
      write();
    }
  }
  return (index, write) => {
    waiting.set(index, write);
    flush();
  };
}

function isSet(value: string | undefined): boolean {
  return (value ?? '') !== '';
}

function colorEnvironment(cli: MonorepoCli): NodeJS.ProcessEnv {
  const { environment } = cli;
  const terminal = 'isTTY' in cli.stdout && cli.stdout.isTTY === true;
  const decided = isSet(environment['NO_COLOR']) || isSet(environment['FORCE_COLOR']);
  return terminal && !decided ? { ...environment, FORCE_COLOR: '1' } : environment;
}

function jobOf(
  context: RunContext,
  run: SelectedRun,
  {
    resultFile,
    environment,
  }: { readonly resultFile: string; readonly environment: NodeJS.ProcessEnv },
): ProjectJob {
  const { cli } = context;
  return {
    input: {
      arguments_: cli.arguments_,
      environment,
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
  readonly capacity: Capacity;
  readonly acquire: (row: ProjectRow) => Promise<() => void>;
  readonly ordered: InOrder;
  readonly resultsRoot: string;
};

async function launchPooled(pool: Pool, row: ProjectRow, launch: Launch): Promise<Finished> {
  const release = await pool.acquire(row);
  try {
    launch.progress.write(`nitpicker: [${launch.label}] started\n`);
    return await launchProject(launch);
  } finally {
    release();
  }
}

function rejection(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

async function runInPool(row: ProjectRow, index: number, pool: Pool): Promise<ProjectRow> {
  const { context, capacity, ordered } = pool;
  const run = selectedRunOf(row, context);
  clearReports(run.reportRoot);
  if (!row.selection.selected) {
    ordered(index, () => undefined);
    return row;
  }
  const share = { weight: capacity.weightOf(row), slots: capacity.slots };
  const environment = workerEnvironment(colorEnvironment(context.cli), share);
  const finished = await launchPooled(pool, row, {
    label: row.project.path,
    job: jobOf(context, run, {
      resultFile: path.join(pool.resultsRoot, `${String(index)}.json`),
      environment: workerEnvironment(context.cli.environment, share),
    }),
    workerScript: context.cli.projectWorker ?? WORKER_SCRIPT,
    environment,
    progress: context.cli.progress,
  });
  const outcome = outcomeOfFinished(row, run, finished);
  ordered(index, () => {
    writeFinished(row, context, finished);
  });
  return { ...row, outcome };
}

async function runRowsInParallel(
  rows: readonly ProjectRow[],
  context: RunContext,
  capacity: Capacity,
): Promise<readonly ProjectRow[]> {
  const semaphore = createWeightedSemaphore(capacity.slots);
  const resultsRoot = await mkdtemp(path.join(tmpdir(), 'nitpicker-projects-'));
  const pool: Pool = {
    context,
    capacity,
    acquire: (row) => semaphore.acquire(capacity.weightOf(row)),
    ordered: inOrder(),
    resultsRoot,
  };
  try {
    const settled = await Promise.allSettled(rows.map((row, index) => runInPool(row, index, pool)));
    const failed = settled.find((result) => result.status === 'rejected');
    if (failed !== undefined) {
      throw rejection(failed.reason);
    }
    return settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  } finally {
    await rm(resultsRoot, { recursive: true, force: true });
  }
}

export function runRows(
  rows: readonly ProjectRow[],
  context: RunContext,
): readonly ProjectRow[] | Promise<readonly ProjectRow[]> {
  const capacity = capacityOf(rows, context.cli);
  return capacity.slots > 1
    ? runRowsInParallel(rows, context, capacity)
    : rows.map((row) => runRow(row, context));
}
