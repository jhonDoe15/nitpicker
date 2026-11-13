import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GENERATOR = new URL('gen-rules.mjs', import.meta.url);
const EMIT = new URL('../typescript/emit.mjs', import.meta.url);
const BUILD_TIMEOUT_MS = 10 * 60 * 1000;
const STRIPS_TYPES = typeof process.features.typescript === 'string';

function runs(script: URL, options: readonly string[]): boolean {
  const { status } = spawnSync(process.execPath, [fileURLToPath(script), ...options], {
    stdio: 'inherit',
    timeout: BUILD_TIMEOUT_MS,
  });
  return status === 0;
}

function cleanEmitted(): void {
  runs(EMIT, ['--clean']);
}

export function setup(): (() => void) | undefined {
  if (!(STRIPS_TYPES || runs(EMIT, []))) {
    throw new Error('Emitting the TypeScript modules failed: run node scripts/typescript/emit.mjs');
  }
  if (!runs(GENERATOR, ['--data'])) {
    if (!STRIPS_TYPES) {
      cleanEmitted();
    }
    throw new Error('Building the rule reference data failed: run npm run gen:rules -- --data');
  }
  return STRIPS_TYPES ? undefined : cleanEmitted;
}
