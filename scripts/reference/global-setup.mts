import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GENERATOR = new URL('gen-rules.mjs', import.meta.url);
const BUILD_TIMEOUT_MS = 10 * 60 * 1000;

export function setup(): void {
  const result = spawnSync(process.execPath, [fileURLToPath(GENERATOR), '--data'], {
    stdio: 'inherit',
    timeout: BUILD_TIMEOUT_MS,
  });
  if (result.status !== 0) {
    throw new Error('Building the rule reference data failed: run npm run gen:rules -- --data');
  }
}
