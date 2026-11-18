import { fileURLToPath } from 'node:url';
import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mjs';
import type { RecipePlan } from '../../../../core/fix/typed/fix-types.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { runTreeProcess } from './tree-process.mts';
import type { Unit } from './jvm-types.mts';

type TreesRequest = {
  readonly root: string | undefined;
  readonly files: readonly string[];
  readonly texts?: Readonly<Record<string, string>>;
  readonly mode?: string;
};

const TREES_PROCESS = fileURLToPath(
  checkoutModuleUrl(new URL('jvm-trees-process.mjs', import.meta.url)),
);

function isUnits(value: unknown): value is Unit[] {
  return Array.isArray(value);
}

function isPlan(value: unknown): value is RecipePlan {
  return Array.isArray(fieldOf(value, 'fixes'));
}

function runTrees(request: TreesRequest): unknown {
  return runTreeProcess({ script: TREES_PROCESS, request, subject: 'Java and Kotlin' });
}

export function readJvmUnits(projectRoot: string, files: readonly string[]): Unit[] {
  if (files.length === 0) {
    return [];
  }
  const units = runTrees({ root: projectRoot, files });
  if (!isUnits(units)) {
    throw new TypeError('Reading Java and Kotlin syntax trees returned no list');
  }
  return units;
}

export function readJavaExtractions(
  projectRoot: string | undefined,
  texts: Readonly<Record<string, string>>,
  mode: string,
): RecipePlan {
  const files = Object.keys(texts);
  if (files.length === 0) {
    return { fixes: [], notes: [] };
  }
  const plan = runTrees({ root: projectRoot, files, texts, mode });
  if (!isPlan(plan)) {
    throw new TypeError('Reading Java syntax trees for extraction returned no plan');
  }
  return plan;
}
