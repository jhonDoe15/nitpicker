import { isPlainObject } from '../../../../../shared/config.mjs';
import { listOf } from '../config-values.mjs';
import { addsEntries, canonical, keyChanges, sortedEntries } from './applied-values.mjs';

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

function ignoredIssues(value) {
  if (!isPlainObject(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([pattern, types]) => [pattern, sortedEntries(types)]),
  );
}

function appliedValue(projectFirst) {
  return (key, value) => {
    if (value === undefined || NITPICKER_KEYS.has(key) || (RANKED_KEYS.has(key) && !projectFirst)) {
      return undefined;
    }
    if (key === 'project') {
      const negated = sortedEntries(value).filter(
        (pattern) => typeof pattern === 'string' && pattern.startsWith('!'),
      );
      return negated.length === 0 ? undefined : negated;
    }
    if (ADDED_LISTS.has(key)) {
      return sortedEntries(value);
    }
    return key === 'ignoreIssues' ? ignoredIssues(value) : value;
  };
}

function addsIgnoredIssues(base = {}, head = {}) {
  if (!isPlainObject(base) || !isPlainObject(head)) {
    return canonical(base) !== canonical(head);
  }
  return Object.entries(head).some(([pattern, types]) => addsEntries(base[pattern], listOf(types)));
}

function loosens(key, base, head) {
  if (ADDED_LISTS.has(key) || key === 'project') {
    return addsEntries(base, head);
  }
  return key === 'ignoreIssues' ? addsIgnoredIssues(base, head) : true;
}

export function knipConfigChanges(applied) {
  const projectFirst = applied.precedence[0] === 'project';
  return keyChanges(applied, { applied: appliedValue(projectFirst), loosens });
}
