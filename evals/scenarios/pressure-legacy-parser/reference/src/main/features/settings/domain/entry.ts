import { splitValueList } from './value-list.js';
import type { ValueList } from './value-list.js';

export function readEntry(key: string, raw: string): ValueList {
  if (key === '') {
    return { kind: 'invalid', reason: 'missing key' };
  }
  if (/[^A-Za-z0-9_.-]/.test(key)) {
    return { kind: 'invalid', reason: `invalid key ${key}` };
  }
  return splitValueList(raw);
}
