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

function buildsReferenceData(): boolean {
  if (STRIPS_TYPES) {
    return runs(GENERATOR, ['--data']);
  }
  if (!runs(EMIT, [])) {
    return false;
  }
  try {
    return runs(GENERATOR, ['--data']);
  } finally {
    runs(EMIT, ['--clean']);
  }
}

export function setup(): void {
  if (!buildsReferenceData()) {
    throw new Error('Building the rule reference data failed: run npm run gen:rules -- --data');
  }
}
