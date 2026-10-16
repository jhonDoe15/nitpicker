import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { resolveTool } from '../../../../../core/tooling/tool-resolution.mjs';

const CONFIG_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs', 'json'];
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const OUTPUT_START = '{\n  "configs"';

export function jestConfigFile(projectRoot) {
  const found = CONFIG_EXTENSIONS.map((extension) => `jest.config.${extension}`).find((name) =>
    existsSync(path.join(projectRoot, name)),
  );
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
  if (binary === undefined) return { failure };
  const result = spawnSync(process.execPath, [binary, '--showConfig', '--no-watchman'], {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: 'test' },
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
