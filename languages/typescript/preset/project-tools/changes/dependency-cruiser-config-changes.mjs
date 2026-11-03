import { isPlainObject, listOf } from '../../../../../shared/config.mjs';
import { isDependencyCruiserOwnedOption, patternSource } from '../config-values.mjs';
import { addsEntries, canonical, keyChanges, sortedEntries } from './applied-values.mjs';

const RULE_LISTS = new Set(['forbidden', 'required']);
const PATH_OPTIONS = new Set(['options.exclude', 'options.doNotFollow']);
const OPTION_PREFIX = 'options.';

function flattened(config) {
  const { options, ...rest } = config;
  return {
    ...rest,
    ...Object.fromEntries(
      Object.entries(isPlainObject(options) ? options : {}).map(([key, value]) => [
        `${OPTION_PREFIX}${key}`,
        value,
      ]),
    ),
  };
}

function pathEntries(option) {
  const source = patternSource(option);
  const paths = isPlainObject(source) ? source.path : source;
  const types = isPlainObject(source) ? listOf(source.dependencyTypes) : [];
  return sortedEntries([
    ...listOf(paths).map((pattern) => `path ${String(patternSource(pattern))}`),
    ...types.map((type) => `dependency type ${String(type)}`),
  ]);
}

function appliedValue(key, value) {
  if (value === undefined) {
    return undefined;
  }
  if (PATH_OPTIONS.has(key)) {
    return pathEntries(value);
  }
  if (
    key.startsWith(OPTION_PREFIX) &&
    isDependencyCruiserOwnedOption(key.slice(OPTION_PREFIX.length))
  ) {
    return undefined;
  }
  return RULE_LISTS.has(key) || key === 'allowed' ? sortedEntries(value) : value;
}

function dropsOrOverrides(base, head) {
  const kept = new Set(listOf(head).map(canonical));
  const before = new Set(listOf(base).map(canonical));
  return (
    listOf(base).some((rule) => !kept.has(canonical(rule))) ||
    listOf(head).some((rule) => !before.has(canonical(rule)) && typeof rule?.name === 'string')
  );
}

function loosens(key, base, head) {
  if (RULE_LISTS.has(key)) {
    return dropsOrOverrides(base, head);
  }
  if (key === 'allowed' || PATH_OPTIONS.has(key)) {
    return addsEntries(base, head);
  }
  return true;
}

export function dependencyCruiserConfigChanges(applied) {
  return keyChanges(
    { ...applied, base: flattened(applied.base), head: flattened(applied.head) },
    { applied: appliedValue, loosens },
  );
}
