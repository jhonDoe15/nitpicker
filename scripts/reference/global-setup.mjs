import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GENERATOR = new URL('gen-rules.mjs', import.meta.url);
const BUILD_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Rebuilds the rule reference data once before the test workers start, so they don't race and
 * never read data left from another commit.
 */
export function setup() {
  const result = spawnSync(process.execPath, [fileURLToPath(GENERATOR), '--data'], {
    stdio: 'inherit',
    timeout: BUILD_TIMEOUT_MS,
  });
  if (result.status !== 0) {
    throw new Error('Building the rule reference data failed: run npm run gen:rules -- --data');
  }
}
