import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isPlainObject } from '../../../../shared/config.mjs';
import { isRealPathInside, resolveInside } from '../../../../shared/conventions/read-inside.mjs';
import { HOST_CI_OUTPUT_VARIABLES } from '../../../../core/tooling/host-environment.mjs';
import { markedPayload } from '../../../../core/tooling/child-output.mjs';

const RESULT_MARKER = 'NITPICKER_PROJECT_CONFIG_RESULT ';
const LOAD_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_MB = 10;
const BYTES_PER_MB = 1024 * 1024;
const MAX_OUTPUT_BYTES = MAX_OUTPUT_MB * BYTES_PER_MB;
const DEFAULT_EXPORT_SCRIPT = [
  "const { pathToFileURL } = await import('node:url');",
  `const marker = ${JSON.stringify(RESULT_MARKER)};`,
  `for (const name of ${JSON.stringify(HOST_CI_OUTPUT_VARIABLES)}) delete process.env[name];`,
  'const report = (payload) => {',
  '  const line = `\\n${marker}${JSON.stringify(payload)}\\n`;',
  '  process.stdout.write(line, () => process.exit(0));',
  '};',
  'try {',
  '  const loaded = await import(pathToFileURL(process.argv[1]).href);',
  '  report({ value: loaded.default ?? null });',
  '} catch (error) {',
  '  report({ failure: String(error?.message ?? error) });',
  '}',
].join('\n');

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

function loadFailure(name, result, timeoutMs) {
  if (result.error?.code === 'ETIMEDOUT') {
    return `${name} did not finish loading within ${String(timeoutMs / 1000)} s`;
  }
  if (result.error?.code === 'ENOBUFS') {
    return `${name} printed more than ${String(MAX_OUTPUT_MB)} MB while loading`;
  }
  const reason = result.error?.message ?? `it ended the process with exit code ${result.status}`;
  return `${name} could not be loaded: ${reason}`;
}

function defaultExport(file, name, { projectRoot, timeoutMs }) {
  const result = spawnSync(
    process.execPath,
    ['--no-warnings', '--input-type=module', '--eval', DEFAULT_EXPORT_SCRIPT, file],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      input: '',
      maxBuffer: MAX_OUTPUT_BYTES,
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    },
  );
  const outcome =
    result.error === undefined ? markedPayload(result.stdout, RESULT_MARKER) : undefined;
  if (outcome === undefined) {
    throw new Error(loadFailure(name, result, timeoutMs));
  }
  if (outcome.failure !== undefined) {
    throw new Error(`${name} could not be loaded: ${outcome.failure}`);
  }
  return outcome.value;
}

export function readConfigObject(projectRoot, name, timeoutMs = LOAD_TIMEOUT_MS) {
  const file = insideProject(projectRoot, name);
  const json = path.extname(name) === '.json';
  const value = json
    ? parsedJson(file, name)
    : defaultExport(file, name, { projectRoot, timeoutMs });
  if (!isPlainObject(value)) {
    throw new Error(
      `${name} must ${json ? 'contain a JSON object' : 'export an object as its default export'}`,
    );
  }
  return value;
}
