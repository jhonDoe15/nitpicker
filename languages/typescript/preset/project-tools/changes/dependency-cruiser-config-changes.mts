import { fieldOf, isPlainObject } from '../../../../../shared/values/readers.mts';
import type { FileChange } from '../../../../../core/policy-changes/types/policy-types.mts';
import { configList as listOf } from '../typed/shared-views.mts';
import type { AppliedChange, ToolValues } from '../typed/tool-types.mts';
import { isDependencyCruiserOwnedOption, patternSource } from '../config-values.mts';
import { addsEntries, canonical, keyChanges, sortedEntries } from './applied-values.mts';

const RULE_LISTS = new Set(['forbidden', 'required']);
const PATH_OPTIONS = new Set(['options.exclude', 'options.doNotFollow']);
const OPTION_PREFIX = 'options.';

function flattened(config: ToolValues): Record<string, unknown> {
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

function pathEntries(option: unknown): unknown[] {
  const source = patternSource(option);
  const paths = isPlainObject(source) ? fieldOf(source, 'path') : source;
  const types = isPlainObject(source) ? listOf(fieldOf(source, 'dependencyTypes')) : [];
  return sortedEntries([
    ...listOf(paths).map((pattern) => `path ${String(patternSource(pattern))}`),
    ...types.map((type) => `dependency type ${String(type)}`),
  ]);
}

function appliedValue(key: string, value: unknown): unknown {
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

function dropsOrOverrides(base: unknown, head: unknown): boolean {
  const kept = new Set(listOf(head).map(canonical));
  const before = new Set(listOf(base).map(canonical));
  return (
    listOf(base).some((rule) => !kept.has(canonical(rule))) ||
    listOf(head).some(
      (rule) => !before.has(canonical(rule)) && typeof fieldOf(rule, 'name') === 'string',
    )
  );
}

function loosens(key: string, base: unknown, head: unknown): boolean {
  if (RULE_LISTS.has(key)) {
    return dropsOrOverrides(base, head);
  }
  if (key === 'allowed' || PATH_OPTIONS.has(key)) {
    return addsEntries(base, head);
  }
  return true;
}

export function dependencyCruiserConfigChanges(applied: AppliedChange): FileChange[] {
  return keyChanges(
    { ...applied, base: flattened(applied.base), head: flattened(applied.head) },
    { applied: appliedValue, loosens },
  );
}
