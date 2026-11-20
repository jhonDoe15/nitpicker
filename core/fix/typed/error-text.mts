import type { Scope } from '../../scope/scope-findings.mts';
import { fieldOf, listOf } from '../../../shared/values/readers.mts';

export function errorCode(error: unknown): unknown {
  return fieldOf(error, 'code');
}

export function scopeOf(value: unknown): Scope | undefined {
  if (value === undefined) {
    return undefined;
  }
  return { paths: listOf(fieldOf(value, 'paths')).filter((path) => typeof path === 'string') };
}
