import { availableParallelism } from 'node:os';
import { type LintResult, type Naming, diagnosticsOf } from '../plan/oxlint-shapes.mts';
import { eslintShapedResults } from '../oxlint-diagnostics.mts';
import { oxlintBinary, spawnJsonAsync, tsgolintBinary } from '../oxlint-process.mts';
import type { Environment } from '../../../../../shared/processes/environment.mts';
import type { StageConfig } from '../stage/oxlint-stage.mts';

export type LintTiming = { readonly environment: Environment; readonly timeoutMs: number };

export type StageRun = LintTiming & { readonly stage: string; readonly naming: Naming };

const MAX_ARGUMENT_BYTES = 1024 * 1024;
const MAX_LINT_SLICES = 4;
const MIN_FILES_PER_SLICE = 200;
const CPUS_PER_LINT_SLICE = 4;

export async function lintConfigs({
  configs,
  ...run
}: StageRun & {
  readonly configs: readonly StageConfig[];
  readonly typeAware: boolean;
}): Promise<LintResult[]> {
  const results: LintResult[] = [];
  for (const config of configs) {
    const slices = fileSlices(config.files);
    const reports = await Promise.allSettled(
      slices.map((files) => lintStage({ ...run, configPath: config.configPath, files })),
    );
    const failed = reports.find(
      (report): report is PromiseRejectedResult => report.status === 'rejected',
    );
    if (failed !== undefined) {
      throw failed.reason;
    }
    results.push(
      ...reports.flatMap((report) => (report.status === 'fulfilled' ? report.value : [])),
    );
  }
  return results;
}

function fileSlices(files: readonly string[]): string[][] {
  const count = Math.max(
    1,
    Math.min(
      MAX_LINT_SLICES,
      Math.floor(availableParallelism() / CPUS_PER_LINT_SLICE),
      Math.floor(files.length / MIN_FILES_PER_SLICE),
    ),
  );
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
    results.push(...eslintShapedResults(stage, diagnosticsOf(report), naming));
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
