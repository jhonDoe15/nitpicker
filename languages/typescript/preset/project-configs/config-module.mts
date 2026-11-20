import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fieldOf, isPlainObject, messageOf } from '../../../../shared/values/readers.mts';
import { isRealPathInside, resolveInside } from '../project-tools/typed/shared-views.mts';
import type { ChildLoad } from './project-config-types.mts';
import { HOST_CI_OUTPUT_VARIABLES } from '../../../../core/tooling/host-environment.mts';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../../core/tooling/temporary-files.mts';

const LOAD_TIMEOUT_MS = 60_000;
const MAX_RESULT_MB = 10;
const BYTES_PER_MB = 1024 * 1024;
const MAX_RESULT_BYTES = MAX_RESULT_MB * BYTES_PER_MB;
const REPORT_PREAMBLE = [
  `for (const name of ${JSON.stringify(HOST_CI_OUTPUT_VARIABLES)}) delete process.env[name];`,
  "const { renameSync, writeFileSync } = await import('node:fs');",
  'const [resultFile] = process.argv.splice(1, 1);',
  'const report = (payload) => {',
  "  const partial = resultFile + '.partial';",
  '  writeFileSync(partial, JSON.stringify(payload));',
  '  renameSync(partial, resultFile);',
  '  process.exit(0);',
  '};',
  'const failureOf = (error) => {',
  '  if (!(error instanceof Error)) return String(error);',
  '  const cause = error.cause instanceof Error ? [error.cause.message] : [];',
  "  return [error.message, ...cause].join(': ');",
  '};',
];

export function loaderScript(...body: string[]): string {
  return [
    ...REPORT_PREAMBLE,
    'try {',
    ...body.map((line) => `  ${line}`),
    '} catch (error) {',
    '  report({ failure: failureOf(error) });',
    '}',
  ].join('\n');
}

const DEFAULT_EXPORT_SCRIPT = loaderScript(
  "const { pathToFileURL } = await import('node:url');",
  'const loaded = await import(pathToFileURL(process.argv[1]).href);',
  'report({ value: loaded.default ?? null });',
);

function insideProject(projectRoot: string, name: string): string {
  const file = resolveInside(projectRoot, name);
  if (file === undefined || !isRealPathInside(projectRoot, file)) {
    throw new Error(`${name} must stay inside the project`);
  }
  return file;
}

function parsedJson(file: string, name: string): unknown {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return parsed;
  } catch (error) {
    throw new Error(`${name} is not valid JSON: ${messageOf(error)}`, { cause: error });
  }
}

function endedReason(result: SpawnSyncReturns<Buffer>): string {
  if (result.error !== undefined) {
    return result.error.message;
  }
  return result.signal === null
    ? `it ended the process with exit code ${String(result.status)}`
    : `it ended the process with ${result.signal}`;
}

function reportedOutcome(
  name: string,
  result: SpawnSyncReturns<Buffer>,
  { resultFile, timeoutMs }: { resultFile: string; timeoutMs: number },
): unknown {
  if (fieldOf(result.error, 'code') === 'ETIMEDOUT') {
    throw new Error(`${name} did not finish loading within ${String(timeoutMs / 1000)} s`);
  }
  if (result.error !== undefined || !existsSync(resultFile)) {
    throw new Error(`${name} could not be loaded: ${endedReason(result)}`);
  }
  if (statSync(resultFile).size > MAX_RESULT_BYTES) {
    throw new Error(`${name} returned more than ${String(MAX_RESULT_MB)} MB of config`);
  }
  return parsedJson(resultFile, `The loaded result of ${name}`);
}

function spawnedOutcome(
  { script, args, name, projectRoot, timeoutMs }: ChildLoad & { timeoutMs: number },
  directory: string,
): unknown {
  const resultFile = path.join(directory, 'result.json');
  const result = spawnSync(
    process.execPath,
    ['--no-warnings', '--input-type=module', '--eval', script, resultFile, ...args],
    {
      cwd: projectRoot,
      stdio: 'ignore',
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    },
  );
  return reportedOutcome(name, result, { resultFile, timeoutMs });
}

export function loadInChild({ timeoutMs = LOAD_TIMEOUT_MS, ...load }: ChildLoad): unknown {
  const directory = trackTemporaryPath(
    mkdtempSync(path.join(tmpdir(), 'nitpicker-project-config-')),
  );
  try {
    const outcome = spawnedOutcome({ ...load, timeoutMs }, directory);
    const failure = fieldOf(outcome, 'failure');
    if (failure !== undefined) {
      throw new Error(`${load.name} could not be loaded: ${messageOf(failure)}`);
    }
    return fieldOf(outcome, 'value');
  } finally {
    rmSync(directory, { recursive: true, force: true });
    untrackTemporaryPath(directory);
  }
}

export function readConfigObject(
  projectRoot: string,
  name: string,
  timeoutMs: number = LOAD_TIMEOUT_MS,
): Record<string, unknown> {
  const file = insideProject(projectRoot, name);
  const json = path.extname(name) === '.json';
  const value = json
    ? parsedJson(file, name)
    : loadInChild({ script: DEFAULT_EXPORT_SCRIPT, args: [file], name, projectRoot, timeoutMs });
  if (!isPlainObject(value)) {
    throw new Error(
      `${name} must ${json ? 'contain a JSON object' : 'export an object as its default export'}`,
    );
  }
  return value;
}
