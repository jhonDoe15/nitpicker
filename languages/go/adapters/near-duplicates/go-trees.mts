import { fileURLToPath } from 'node:url';
import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mjs';
import { readTreeUnits } from '../../../java/adapters/near-duplicates/batches/tree-batches.mts';
import type { GoUnit } from './types/go-types.mts';

const TREES_PROCESS = fileURLToPath(
  checkoutModuleUrl(new URL('go-trees-process.mjs', import.meta.url)),
);

function isUnits(value: unknown): value is GoUnit[] {
  return Array.isArray(value);
}

export function readGoUnits(projectRoot: string, files: readonly string[]): GoUnit[] {
  const units = readTreeUnits({ script: TREES_PROCESS, root: projectRoot, files, subject: 'Go' });
  if (!isUnits(units)) {
    throw new TypeError('Reading Go syntax trees for near-duplicate detection returned no list');
  }
  return units;
}
