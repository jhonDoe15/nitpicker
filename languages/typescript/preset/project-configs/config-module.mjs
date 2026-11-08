import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isPlainObject } from '../../../../shared/config.mjs';
import { isRealPathInside, resolveInside } from '../../../../shared/conventions/read-inside.mjs';
import { withoutHostCiOutputs } from '../../../../core/tooling/host-environment.mjs';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../../core/tooling/temporary-files.mjs';

const LOAD_TIMEOUT_MS = 60_000;
const MAX_RESULT_MB = 10;
const BYTES_PER_MB = 1024 * 1024;
const MAX_RESULT_BYTES = MAX_RESULT_MB * BYTES_PER_MB;
const REPORT_PREAMBLE = [
  "const { writeFileSync } = await import('node:fs');",
  'const [resultFile] = process.argv.splice(1, 1);',
  'const report = (payload) => {',
  '  writeFileSync(resultFile, JSON.stringify(payload));',
  '  process.exit(0);',
  '};',
  'const failureOf = (error) => {',
  '  if (!(error instanceof Error)) return String(error);',
  '  const cause = error.cause instanceof Error ? `: ${error.cause.message}` : "";',
  '  return `${error.message}${cause}`;',
  '};',
];

export function loaderScript(...body) {
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

function insideProject(projectRoot, name) {
  const file = resolveInside(projectRoot, name);
  if (file === undefined || !isRealPathInside(projectRoot, file)) {
    throw new Error(`${name} must stay inside the project`);
  }
  return file;
}

function parsedJson(file, name) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${name} is not valid JSON: ${error.message}`, { cause: error });
  }
}

function endedReason(result) {
  if (result.error !== undefined) {
    return result.error.message;
  }
  return result.signal === null
    ? `it ended the process with exit code ${String(result.status)}`
    : `it ended the process with ${result.signal}`;
}

function reportedOutcome(name, result, { resultFile, timeoutMs }) {
  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(`${name} did not finish loading within ${String(timeoutMs / 1000)} s`);
  }
  if (result.error !== undefined || !existsSync(resultFile)) {
    throw new Error(`${name} could not be loaded: ${endedReason(result)}`);
  }
  if (statSync(resultFile).size > MAX_RESULT_BYTES) {
    throw new Error(`${name} returned more than ${String(MAX_RESULT_MB)} MB of config`);
  }
  return JSON.parse(readFileSync(resultFile, 'utf8'));
}

function spawnedOutcome({ script, args, name, projectRoot, timeoutMs, env }, directory) {
  const resultFile = path.join(directory, 'result.json');
  const result = spawnSync(
    process.execPath,
    ['--no-warnings', '--input-type=module', '--eval', script, resultFile, ...args],
    {
      cwd: projectRoot,
      env: withoutHostCiOutputs({ ...process.env, ...env }),
      stdio: 'ignore',
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    },
  );
  return reportedOutcome(name, result, { resultFile, timeoutMs });
}

export function loadInChild({ timeoutMs = LOAD_TIMEOUT_MS, env = {}, ...load }) {
  const directory = trackTemporaryPath(
    mkdtempSync(path.join(tmpdir(), 'nitpicker-project-config-')),
  );
  try {
    const outcome = spawnedOutcome({ ...load, timeoutMs, env }, directory);
    if (outcome.failure !== undefined) {
      throw new Error(`${load.name} could not be loaded: ${outcome.failure}`);
    }
    return outcome.value;
  } finally {
    rmSync(directory, { recursive: true, force: true });
    untrackTemporaryPath(directory);
  }
}

export function readConfigObject(projectRoot, name, timeoutMs = LOAD_TIMEOUT_MS) {
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
