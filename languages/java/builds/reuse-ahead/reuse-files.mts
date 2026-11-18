import type { ReusePart } from '../../adapters/reuse/jvm-reuse-types.mts';
import { findingsOf } from '../../adapters/typed/java-values.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';

export const REQUEST_FILE = 'request.json';
export const RESULT_FILE = 'result.json';
export const STATUS_FILE = 'status.json';
export const HEARTBEAT_FILE = 'heartbeat';
export const HEARTBEAT_MS = 1000;
export const SILENCE_LIMIT_MS = 30 * HEARTBEAT_MS;

function listIn(value: unknown, key: string): readonly unknown[] | undefined {
  const list = fieldOf(value, key);
  return Array.isArray(list) ? list : undefined;
}

export function reusePartOf(value: unknown): ReusePart | undefined {
  const usage = fieldOf(value, 'usage');
  const modules = listIn(usage, 'modules');
  const packages = listIn(usage, 'packages');
  const imports = listIn(usage, 'imports');
  if (modules === undefined || packages === undefined || imports === undefined) {
    return undefined;
  }
  return {
    findings: findingsOf(fieldOf(value, 'findings')),
    entryFindings: findingsOf(fieldOf(value, 'entryFindings')),
    usage: { modules, packages, imports },
  };
}
