import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolveTool } from '../../../../../core/tooling/tool-resolution.mjs';

const CONFIG_NAMES = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs', 'json'].map(
  (extension) => `jest.config.${extension}`,
);
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const OUTPUT_START = '{\n  "configs"';

export function jestConfigFile(projectRoot) {
  const present = new Set(readdirSync(projectRoot));
  const found = CONFIG_NAMES.find((name) => present.has(name));
  return found ?? 'package.json';
}

function jestBinary(projectRoot, liveProjectRoot) {
  const failures = [];
  for (const root of new Set([liveProjectRoot, projectRoot])) {
    try {
      return { binary: resolveTool('jest', { projectRoot: root, bin: 'bin/jest.js' }).binPath };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { failure: `jest could not be resolved from the project (${failures.join('; ')})` };
}

function errorSummary(result) {
  const lines = result.stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length === 0 ? '' : `: ${lines.slice(0, 2).join(' ')}`;
}

function parsedConfig(result) {
  const start = result.stdout.lastIndexOf(OUTPUT_START);
  if (start === -1) {
    return {
      failure: `jest --showConfig exited with code ${String(result.status)}${errorSummary(result)}`,
    };
  }
  try {
    return { config: JSON.parse(result.stdout.slice(start)) };
  } catch (error) {
    return { failure: error instanceof Error ? error.message : String(error) };
  }
}

export function readJestConfig({ projectRoot, liveProjectRoot, timeoutMs }) {
  const { binary, failure } = jestBinary(projectRoot, liveProjectRoot);
  if (binary === undefined) {
    return { failure };
  }
  const result = spawnSync(process.execPath, [binary, '--showConfig', '--no-watchman'], {
    cwd: projectRoot,
    encoding: 'utf8',
    input: '',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
  });
  if (result.error?.code === 'ETIMEDOUT') {
    return { failure: `it did not finish within ${String(timeoutMs)} ms` };
  }
  return result.error === undefined ? parsedConfig(result) : { failure: result.error.message };
}
