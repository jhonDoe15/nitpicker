import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkoutModulePath } from '../../../../shared/paths/checkout-module.mjs';

const TREES_PROCESS = checkoutModulePath(
  fileURLToPath(new URL('java-trees-process.mjs', import.meta.url)),
);
const TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT_BYTES = 2 ** 30;

export function readJavaUnits(projectRoot, files) {
  if (files.length === 0) {
    return [];
  }
  const result = spawnSync(process.execPath, [TREES_PROCESS], {
    input: JSON.stringify({ root: projectRoot, files }),
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: TIMEOUT_MS,
  });
  if (result.status !== 0) {
    const reason = result.error?.message ?? result.stderr.trim().split('\n').at(-1);
    throw new Error(`Reading Java syntax trees for near-duplicate detection failed: ${reason}`);
  }
  return JSON.parse(result.stdout);
}
