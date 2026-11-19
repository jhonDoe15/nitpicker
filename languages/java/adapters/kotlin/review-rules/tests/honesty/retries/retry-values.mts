import type { TestScanned } from '../../typed/discovery-types.mts';
import { groupOf } from '../../typed/indexing.mts';
const NO_RETRIES = /^(?:0|null)\s*(?:[,)}\]]|$)/u;
const CONSTANT_NAME = /^([A-Za-z_]\w*)\s*(?:[,)}\]]|$)/u;
const VALUE_DECLARATION =
  /(?:^|[\s;])(?:const\s+)?val\s+([A-Za-z_]\w*)(?:\s*:\s*Int\??)?\s*=\s*([^\n;]*)/gu;

export function zeroConstants(scanned: TestScanned): Set<string> {
  const zero = new Set<string>();
  const other = new Set<string>();
  for (const match of scanned.code.matchAll(VALUE_DECLARATION)) {
    (NO_RETRIES.test(groupOf(match, 2).trim()) ? zero : other).add(groupOf(match, 1));
  }
  return new Set([...zero].filter((name) => !other.has(name)));
}

export function retriesOn(value: string | undefined, zeros: Set<string>): boolean {
  if (value === undefined) {
    return false;
  }
  const trimmed = value.trim();
  const name = CONSTANT_NAME.exec(trimmed)?.[1];
  return !(NO_RETRIES.test(trimmed) || (name !== undefined && zeros.has(name)));
}
