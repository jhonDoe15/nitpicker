import { normalizeGitPath } from '../../git/normalize.mts';
import { expandMetricFindings } from '../../../../shared/report-output/metric-groups.mjs';
import { isPlainObject } from '../../../../shared/values/readers.mts';

export { isPlainObject as isRecord };

export const expandMetricEntries: (entries: readonly unknown[]) => unknown[] = expandMetricFindings;

type IntegerBound = { readonly minimum: number; readonly kind: string };

const POSITIVE: IntegerBound = { minimum: 1, kind: 'positive' };
const NON_NEGATIVE: IntegerBound = { minimum: 0, kind: 'non-negative' };

function integerAtLeast(value: unknown, context: string, { minimum, kind }: IntegerBound): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${context} must be a ${kind} integer`);
  }
  return value;
}

export function positiveInteger(value: unknown, context: string): number {
  return integerAtLeast(value, context, POSITIVE);
}

export function nonNegativeInteger(value: unknown, context: string): number {
  return integerAtLeast(value, context, NON_NEGATIVE);
}

export function requiredRecord(value: unknown, context: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new TypeError(`${context} must be an object`);
  }
  return value;
}

export function finiteNumber(value: unknown, context: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${context} must be a finite number`);
  }
  return value;
}

export function requiredString(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new TypeError(`${context} must be a non-empty string`);
  }
  return value;
}

export function normalizeFindingPath(value: string, context: string): string {
  const normalizedPath = normalizeGitPath(value);
  if (
    normalizedPath === '..' ||
    normalizedPath.startsWith('../') ||
    normalizedPath.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalizedPath)
  ) {
    throw new TypeError(`${context} must stay within the analyzed project`);
  }
  return normalizedPath;
}
