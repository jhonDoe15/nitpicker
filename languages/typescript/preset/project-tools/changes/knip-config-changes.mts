import { fieldOf, isPlainObject } from '../../../../../shared/values/readers.mts';
import type { FileChange } from '../../../../../core/policy-changes/types/policy-types.mts';
import { configList as listOf } from '../typed/shared-views.mts';
import type { AppliedChange } from '../typed/tool-types.mts';
import { addsEntries, canonical, keyChanges, sortedEntries } from './applied-values.mts';

const PROJECT = 'project';
const NITPICKER_KEYS = new Set([
  '$schema',
  'treatConfigHintsAsErrors',
  'treatTagHintsAsErrors',
  'compilers',
  'syncCompilers',
  'asyncCompilers',
]);
const ADDED_LISTS = new Set([
  'entry',
  'ignore',
  'ignoreFiles',
  'ignoreDependencies',
  'ignoreBinaries',
  'ignoreMembers',
  'ignoreUnresolved',
  'ignoreWorkspaces',
]);
const RANKED_KEYS = new Set([
  'rules',
  'include',
  'exclude',
  'ignoreExportsUsedInFile',
  'includeEntryExports',
  'cycles',
  'tags',
]);

function ignoredIssues(value: unknown): unknown {
  if (!isPlainObject(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([pattern, types]) => [pattern, sortedEntries(types)]),
  );
}

function appliedValue(projectFirst: boolean): (key: string, value: unknown) => unknown {
  return (key, value) => {
    if (value === undefined || NITPICKER_KEYS.has(key) || (RANKED_KEYS.has(key) && !projectFirst)) {
      return undefined;
    }
    if (key === PROJECT) {
      const negated = sortedEntries(value).filter(
        (pattern): pattern is string => typeof pattern === 'string' && pattern.startsWith('!'),
      );
      return negated.length === 0 ? undefined : negated;
    }
    if (ADDED_LISTS.has(key)) {
      return sortedEntries(value);
    }
    return key === 'ignoreIssues' ? ignoredIssues(value) : value;
  };
}

function addsIgnoredIssues(base: unknown = {}, head: unknown = {}): boolean {
  if (!(isPlainObject(base) && isPlainObject(head))) {
    return canonical(base) !== canonical(head);
  }
  return Object.entries(head).some(([pattern, types]) =>
    addsEntries(fieldOf(base, pattern), listOf(types)),
  );
}

function loosens(key: string, base: unknown, head: unknown): boolean {
  if (ADDED_LISTS.has(key) || key === PROJECT) {
    return addsEntries(base, head);
  }
  return key !== 'ignoreIssues' || addsIgnoredIssues(base, head);
}

export function knipConfigChanges(applied: AppliedChange): FileChange[] {
  const projectFirst = applied.precedence?.[0] === PROJECT;
  return keyChanges(applied, { applied: appliedValue(projectFirst), loosens });
}
