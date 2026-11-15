import type { Finding } from '../../../../../../shared/values/findings.mts';

function isFindingList(value: unknown): value is Finding[] {
  return Array.isArray(value);
}

export function findingsOf(value: unknown): Finding[] {
  if (!isFindingList(value)) {
    throw new TypeError('The analyzer did not return a list of findings');
  }
  return value;
}
