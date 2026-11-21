import { availableParallelism, totalmem } from 'node:os';
import { type LintResult, type Naming, diagnosticsOf } from '../plan/oxlint-shapes.mts';
import { eslintShapedResults } from '../oxlint-diagnostics.mts';
import { oxlintBinary, spawnJsonAsync, tsgolintBinary } from '../oxlint-process.mts';
import type { Environment } from '../../../../../shared/processes/environment.mts';
import type { StageConfig } from '../stage/oxlint-stage.mts';
import { appendAll } from '../../../../../shared/lists/lists.mts';
import { mergedPassResults } from './pass-directives.mts';
import { lintInPrograms } from '../programs/type-aware-programs.mts';

export type LintTiming = {
  readonly environment: Environment;
  readonly timeoutMs: number | undefined;
};

export type StageRun = LintTiming & { readonly stage: string; readonly naming: Naming };

const MAX_ARGUMENT_BYTES = 1024 * 1024;
const MIN_FILES_PER_SLICE = 200;
const GIB = 1024 ** 3;
const MEMORY_PER_SLICE = 1.5 * GIB;
const LINT_MEMORY_PERCENT = 75;
const PROGRAM_BYTES_PER_FILE = 0.75 * 1024 ** 2;

function machineMemory(): number {
  const constrained = process.constrainedMemory();
  const total = totalmem();
  return constrained > 0 && constrained < total ? constrained : total;
}

function runsBesideTypeChecks(fileCount: number, memory = machineMemory()): boolean {
  return 2 * fileCount * PROGRAM_BYTES_PER_FILE <= (memory * LINT_MEMORY_PERCENT) / 100;
}

type Settled = PromiseSettledResult<LintResult[]>;

export async function settledBeside(
  lint: () => Promise<LintResult[]>,
  residual: () => Promise<LintResult[]>,
  { configs }: { readonly configs: readonly StageConfig[] },
): Promise<readonly [Settled, Settled]> {
  const fileCount = new Set(configs.flatMap(({ files }) => files)).size;
  if (runsBesideTypeChecks(fileCount)) {
    const [linted, rest] = await Promise.allSettled([lint(), residual()]);
    return [linted, rest];
  }
  const [linted] = await Promise.allSettled([lint()]);
  if (linted.status === 'rejected') {
    return [linted, { status: 'fulfilled', value: [] }];
  }
  const [rest] = await Promise.allSettled([residual()]);
  return [linted, rest];
}

export async function lintConfigs({
  configs,
  ...run
}: StageRun & { readonly configs: readonly StageConfig[] }): Promise<LintResult[]> {
  const passes: { typeAware: boolean; results: LintResult[] }[] = [];
  for (const config of configs) {
    const lintFiles = (files: readonly string[]): Promise<LintResult[]> =>
      lintStage({ ...run, configPath: config.configPath, files, typeAware: config.typeAware });
    const reports = await Promise.allSettled(
      config.typeAware
        ? [lintInPrograms({ ...run, files: config.files }, lintFiles)]
        : fileSlices(config.files).map(lintFiles),
    );
    const failed = reports.find(
      (report): report is PromiseRejectedResult => report.status === 'rejected',
    );
    if (failed !== undefined) {
      throw failed.reason;
    }
    passes.push({
      typeAware: config.typeAware,
      results: reports.flatMap((report) => (report.status === 'fulfilled' ? report.value : [])),
    });
  }
  return mergedPassResults(passes);
}

export function sliceCount(
  fileCount: number,
  cpus = availableParallelism(),
  memory = machineMemory(),
): number {
  const byMemory = Math.floor((memory * LINT_MEMORY_PERCENT) / 100 / MEMORY_PER_SLICE);
  return Math.max(1, Math.min(cpus, byMemory, Math.floor(fileCount / MIN_FILES_PER_SLICE)));
}

function fileSlices(files: readonly string[]): string[][] {
  const count = sliceCount(files.length);
  return Array.from({ length: count }, (_slice, index) =>
    files.filter((_file, position) => position % count === index),
  );
}

async function lintStage({
  stage,
  configPath,
  files,
  typeAware,
  naming,
  environment,
  timeoutMs,
}: StageRun & {
  readonly configPath: string;
  readonly files: readonly string[];
  readonly typeAware: boolean;
}): Promise<LintResult[]> {
  const typeAwareEnvironment = typeAware ? { OXLINT_TSGOLINT_PATH: tsgolintBinary() } : {};
  const results: LintResult[] = [];
  for (const chunk of argumentChunks(files)) {
    const report = await spawnJsonAsync(
      [
        oxlintBinary(),
        '--config',
        configPath,
        '--format',
        'json',
        '--no-ignore',
        '--disable-nested-config',
        '--report-unused-disable-directives',
        ...(typeAware ? ['--type-aware'] : []),
        ...chunk,
      ],
      {
        cwd: stage,
        env: { ...environment, ...typeAwareEnvironment },
        context: 'oxlint',
        timeoutMs,
        acceptedStatuses: [0, 1],
      },
    );
    appendAll(results, eslintShapedResults(stage, diagnosticsOf(report), naming));
  }
  return results;
}

function argumentChunks(files: readonly string[]): string[][] {
  const chunks: string[][] = [[]];
  let size = 0;
  for (const file of files) {
    if (size + file.length > MAX_ARGUMENT_BYTES && (chunks.at(-1)?.length ?? 0) > 0) {
      chunks.push([]);
      size = 0;
    }
    chunks.at(-1)?.push(file);
    size += file.length + 1;
  }
  return chunks.filter((chunk) => chunk.length > 0);
}
