import { applyFindingExceptions as untypedApply } from '../../../../../shared/exceptions/finding-exceptions.mjs';
import { findingPaths as untypedPaths } from '../../../../../shared/exceptions/matching.mjs';
import { globMatcher as untypedMatcher } from '../../../../../shared/paths/glob.mjs';
import { callUntyped as call } from '../../../../../shared/values/boundaries/untyped-call.mts';
import { fieldOf, listOf, textsOf } from '../../../../../shared/values/readers.mts';

export type Matcher = { test(file: string): boolean };

function isMatcher(value: unknown): value is Matcher {
  return typeof fieldOf(value, 'test') === 'function';
}

export function globMatcher(glob: string): Matcher {
  const matcher = call(untypedMatcher, glob);
  if (!isMatcher(matcher)) {
    throw new Error(`Not a glob matcher: ${glob}`);
  }
  return matcher;
}

export function findingPaths(finding: object): string[] {
  return textsOf(call(untypedPaths, finding));
}

export function applyFindingExceptions<T extends object>(
  findings: readonly T[],
  exceptions: readonly object[],
): T[] {
  const kept = new Set(listOf(call(untypedApply, findings, exceptions)));
  return findings.filter((finding) => kept.has(finding));
}
