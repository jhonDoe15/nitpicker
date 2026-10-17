import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { RESULT_MARKER } from '../read-environment.mjs';

const READER = path.join(import.meta.dirname, '..', 'read-environment.mjs');
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

export function readViteConfig({
  configFile,
  projectRoot,
  resolveRoots,
  timeoutMs,
  parentEnvironment = process.env,
}) {
  const result = spawnSync(process.execPath, [READER, configFile, projectRoot, ...resolveRoots], {
    cwd: projectRoot,
    env: { ...parentEnvironment, VITEST: 'true', NODE_ENV: 'test' },
    encoding: 'utf8',
    input: '',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
  });
  if (result.error?.code === 'ETIMEDOUT') {
    return { failure: `it did not finish within ${String(timeoutMs)} ms` };
  }
  if (result.error !== undefined) {
    return { failure: result.error.message };
  }
  const line = result.stdout
    .split('\n')
    .findLast((candidate) => candidate.startsWith(RESULT_MARKER));
  if (line === undefined) {
    return { failure: `the config ended the process with exit code ${String(result.status)}` };
  }
  return JSON.parse(line.slice(RESULT_MARKER.length));
}
