import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DATA = new URL('../../shared/reference/rules/', import.meta.url);
const GENERATOR = new URL('gen-rules.mjs', import.meta.url);
const BUILD_TIMEOUT_MS = 10 * 60 * 1000;

/** Builds the rule reference data once before the test workers start, so they don't race. */
export function setup() {
  if (existsSync(DATA)) {
    return;
  }
  const result = spawnSync(process.execPath, [fileURLToPath(GENERATOR), '--data'], {
    stdio: 'inherit',
    timeout: BUILD_TIMEOUT_MS,
  });
  if (result.status !== 0) {
    throw new Error('Building the rule reference data failed: run npm run gen:rules -- --data');
  }
}
