import { pluralize } from './style.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';

const DIFF_COUNTS = ['base', 'head', 'new', 'resolved', 'unchanged', 'changedMetrics'];
const SNAPSHOT_COUNTS = ['total', 'enforceable', 'descriptive'];

function hasCount(tool: unknown, properties: readonly string[]): boolean {
  return properties.some((property) => Number(fieldOf(tool, property) ?? 0) > 0);
}

export function isActiveDiffTool(tool: unknown): boolean {
  return fieldOf(tool, 'skippedBecause') !== undefined || hasCount(tool, DIFF_COUNTS);
}

export function isActiveSnapshotTool(tool: unknown): boolean {
  return fieldOf(tool, 'skippedBecause') !== undefined || hasCount(tool, SNAPSHOT_COUNTS);
}

export function splitTools<T>(
  tools: readonly T[],
  isActive: (tool: T) => boolean,
): { readonly active: T[]; readonly clean: number } {
  const active = tools.filter(isActive);
  return { active, clean: tools.length - active.length };
}

export function cleanLine(clean: number): string {
  return `${String(clean)} ${pluralize('analyzer', clean)} ran clean`;
}
