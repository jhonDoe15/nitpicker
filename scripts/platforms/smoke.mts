import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { type Fields, fieldsOf, listOf } from '../json/fields.mts';
import { createSampleRepository, REPOSITORY_ROOT } from './samples.mts';
import { containedPath } from '../../core/fix/common/contained-path.mjs';
import { checkoutModulePath } from '../../shared/paths/checkout-module.mjs';

const sourcePath: (file: string) => string = checkoutModulePath;
const CLI = sourcePath(path.join(REPOSITORY_ROOT, 'core/cli.mjs'));
const RUN_TIMEOUT_MS = 60 * 60 * 1000;
const RUNTIMES: Readonly<Record<string, () => readonly [string, ...string[]]>> = {
  node: () => [process.execPath],
  deno: () => ['deno', 'run', '-A'],
};

export type NormalizedRun = {
  readonly exitCode: number | undefined;
  readonly findings: readonly string[];
  readonly toolErrors: readonly string[];
  readonly toolErrorMessages: readonly string[];
};

export type PlatformRun = {
  readonly sample: string;
  readonly runtime: string;
  readonly platform: string;
  readonly all: NormalizedRun;
  readonly change: NormalizedRun;
};

function slashed(text: unknown): string {
  return typeof text === 'string' ? text.replaceAll('\\', '/') : '';
}

export function findingKey({ tool, rule, path: file, identity, classification }: Fields): string {
  return JSON.stringify([tool, rule, slashed(file), slashed(identity), classification]);
}

export function toolErrorKey({ snapshot, tool, rule }: Fields): string {
  return JSON.stringify([snapshot, tool, rule ?? 'crash']);
}

function readReport(directory: string, name: string): Fields[] {
  const file = containedPath(directory, name);
  const parsed: unknown = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  return listOf(parsed).map((entry) => fieldsOf(entry) ?? {});
}

export function normalizedRun({
  exitCode,
  reports,
  findingsFile,
}: {
  readonly exitCode: number | undefined;
  readonly reports: string;
  readonly findingsFile: string;
}): NormalizedRun {
  const toolErrors = readReport(reports, 'tool-errors.json');
  return {
    exitCode,
    findings: readReport(reports, findingsFile).map(findingKey).toSorted(),
    toolErrors: toolErrors.map(toolErrorKey).toSorted(),
    toolErrorMessages: toolErrors.map(
      (error) => `${toolErrorKey(error)}: ${String(error['message'])}`,
    ),
  };
}

type NitpickerRun = {
  readonly runtime: string;
  readonly root: string;
  readonly args: readonly string[];
  readonly coverageEvidence: string;
};

function evidenceEnvironmentFile(coverageEvidence: string): string {
  const file = `${coverageEvidence}.env`;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `NITPICKER_KEEP_COVERAGE_REPORT=${coverageEvidence}\n`);
  return file;
}

function runNitpicker({ runtime, root, args, coverageEvidence }: NitpickerRun): number | undefined {
  const launcher = RUNTIMES[runtime];
  if (launcher === undefined) {
    throw new Error(`Unknown runtime ${runtime}`);
  }
  const [command, ...prefix] = launcher();
  const envFile = `--env-file=${evidenceEnvironmentFile(coverageEvidence)}`;
  const result = spawnSync(command, [...prefix, envFile, CLI, ...args], {
    cwd: root,
    stdio: 'inherit',
    timeout: RUN_TIMEOUT_MS,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  return result.status === null ? undefined : result.status;
}

function keepReports(repository: { readonly root: string }, directory: string): void {
  const reports = path.join(repository.root, 'reports');
  if (existsSync(reports)) {
    cpSync(reports, directory, { recursive: true });
  }
}

export type SampleRun = {
  readonly sample: string;
  readonly runtime: string;
  readonly reportsDirectory: string | undefined;
};

export function runSample({ sample, runtime, reportsDirectory }: SampleRun): PlatformRun {
  const repository = createSampleRepository(sample);
  try {
    const allReports = path.join(repository.root, 'reports/all');
    const shared = { runtime, root: repository.root };
    function evidence(part: string): string {
      return containedPath(path.join(repository.root, 'reports/coverage-evidence'), part);
    }
    const all = runNitpicker({
      ...shared,
      args: ['--all', '--output', allReports],
      coverageEvidence: evidence('all'),
    });
    repository.change();
    const changeReports = path.join(repository.root, 'reports/change');
    const change = runNitpicker({
      ...shared,
      args: ['--base', 'main', '--output', changeReports],
      coverageEvidence: evidence('change'),
    });
    return {
      sample,
      runtime,
      platform: process.platform,
      all: normalizedRun({ exitCode: all, reports: allReports, findingsFile: 'findings.json' }),
      change: normalizedRun({
        exitCode: change,
        reports: changeReports,
        findingsFile: 'new-findings.json',
      }),
    };
  } finally {
    if (reportsDirectory !== undefined) {
      keepReports(repository, reportsDirectory);
    }
    repository.remove();
  }
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: 'string', default: 'reports/platforms' },
      runtime: { type: 'string', default: 'node' },
    },
  });
  if (!Object.hasOwn(RUNTIMES, values.runtime)) {
    throw new Error(
      `Unknown runtime ${values.runtime}; choose one of ${Object.keys(RUNTIMES).join(',')}`,
    );
  }
  mkdirSync(values.output, { recursive: true });
  for (const sample of positionals) {
    const run = runSample({
      sample,
      runtime: values.runtime,
      reportsDirectory: containedPath(values.output, `${sample}-reports`),
    });
    writeFileSync(path.join(values.output, `${sample}.json`), `${JSON.stringify(run, null, 2)}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main();
}
