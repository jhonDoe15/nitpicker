import path from 'node:path';
import {
  configError,
  DRIVE_LETTER,
  filesFix,
  isNonEmptyString,
  isPlainObject,
  validateGlobs,
  validateStringArray,
} from '../config.mts';
import { isPlaceholderReason } from '../messages/exception-sentence.mts';
import {
  FUNCTION_EXCEPTION_RULES,
  FUNCTION_REQUIRED_RULES,
  NAME_EXCEPTION_RULES,
} from '../policy.mts';
import { PACKAGE_EXCEPTION_RULES } from '../project-rules/hygiene-rules.mts';
import { canonicalRule, toolPrefixError } from './rule-names.mts';
import { suggestionOrAllowed } from '../messages/closest-match.mts';
import { fieldOf, listOf, textOf } from '../values/readers.mts';

type Entry = Record<string, unknown>;
type OwnGlobs = (rule: string) => boolean;

export const EXCEPTION_KEYS: readonly string[] = [
  'rule',
  'paths',
  'packages',
  'function',
  'name',
  'reason',
];

export const COMPILER_DIAGNOSTIC = /^(?:[\w-]+\/)?TS\d+$/u;

function canonicalEntries(entries: readonly unknown[]): unknown[] {
  return entries.map((entry) =>
    isPlainObject(entry) && typeof entry['rule'] === 'string'
      ? { ...entry, rule: canonicalRule(entry['rule']) }
      : entry,
  );
}

export function withCanonicalRules(config: unknown): unknown {
  if (!isPlainObject(config)) {
    return config;
  }
  const python = config['python'];
  return {
    ...config,
    ...(Array.isArray(config['exceptions'])
      ? { exceptions: canonicalEntries(listOf(config['exceptions'])) }
      : {}),
    ...(isPlainObject(python) && Array.isArray(python['exceptions'])
      ? { python: { ...python, exceptions: canonicalEntries(listOf(python['exceptions'])) } }
      : {}),
  };
}

export function liftsOnlyRules(exceptions: unknown, rules: readonly string[]): boolean {
  return (
    Array.isArray(exceptions) &&
    listOf(exceptions).every((entry) => {
      const rule = fieldOf(entry, 'rule');
      return typeof rule === 'string' && rules.includes(canonicalRule(rule));
    })
  );
}

export function validateExceptions(
  exceptions: unknown,
  name = 'exceptions',
  {
    preset,
    matchesOwnGlobs = () => true,
  }: { readonly preset?: string | undefined; readonly matchesOwnGlobs?: OwnGlobs } = {},
): void {
  if (!Array.isArray(exceptions)) {
    throw configError(`"${name}" must be an array`);
  }
  for (const [index, entry] of listOf(exceptions).entries()) {
    validateException(entry, `${name}[${String(index)}]`, { preset, matchesOwnGlobs });
  }
}

function validateExceptionShape(entry: unknown, label: string): asserts entry is Entry {
  if (!isPlainObject(entry)) {
    throw configError(`"${label}" must be an object`);
  }
  for (const key of Object.keys(entry)) {
    if (!EXCEPTION_KEYS.includes(key)) {
      throw configError(
        `unknown key "${key}" in "${label}"${suggestionOrAllowed(key, EXCEPTION_KEYS)}`,
      );
    }
  }
}

function validateExceptionRule(entry: Entry, label: string, preset: string | undefined): void {
  const rule = entry['rule'];
  if (!isNonEmptyString(rule)) {
    throw configError(`"${label}.rule" must be a non-empty rule id`);
  }
  if (COMPILER_DIAGNOSTIC.test(rule)) {
    throw configError(
      `"${label}.rule" is "${rule}", a TypeScript compiler diagnostic: it has no exception, fix the type error`,
    );
  }
  const prefixError = toolPrefixError(rule, preset);
  if (prefixError !== undefined) {
    throw configError(`"${label}.rule" has an ${prefixError}`);
  }
}

function validateExceptionReason(entry: Entry, label: string): void {
  const reason = typeof entry['reason'] === 'string' ? entry['reason'].trim() : '';
  if (reason === '') {
    throw configError(`"${label}.reason" is required: say why the rule is lifted for these paths`);
  }
  if (isPlaceholderReason(reason)) {
    throw configError(
      `"${label}.reason" is a placeholder like the "..." a message prints: say why this is intended`,
    );
  }
}

function validateException(
  entry: unknown,
  label: string,
  {
    preset,
    matchesOwnGlobs,
  }: { readonly preset: string | undefined; readonly matchesOwnGlobs: OwnGlobs },
): void {
  validateExceptionShape(entry, label);
  validateExceptionRule(entry, label, preset);
  validateExceptionPaths(entry, label, matchesOwnGlobs);
  validateNarrowing(entry, label);
  validateExceptionReason(entry, label);
  if (entry['packages'] !== undefined) {
    validatePackages(entry, label);
  }
}

export const EXCEPTION_PARENT_SEGMENT = /(?:^|\/)\.\.(?:\/|$)/u;

export const WINDOWS_SEPARATOR = /\\(?![{}[\],*?\\])/u;

function validateExceptionPath(glob: string, pathsLabel: string): void {
  if (glob.trim() === '') {
    throw configError(`"${pathsLabel}" has an empty path glob`);
  }
  if (path.isAbsolute(glob) || DRIVE_LETTER.test(glob)) {
    throw configError(`"${pathsLabel}" has "${glob}": use a glob relative to the project root`);
  }
  if (WINDOWS_SEPARATOR.test(glob)) {
    throw configError(
      `"${pathsLabel}" has "${glob}": separate folders with "/"; a backslash only escapes one of { } [ ] , * ? \\`,
    );
  }
  if (EXCEPTION_PARENT_SEGMENT.test(glob)) {
    throw configError(`"${pathsLabel}" has "${glob}": use a glob without \`..\``);
  }
}

function validateExceptionPaths(entry: Entry, label: string, matchesOwnGlobs: OwnGlobs): void {
  const paths = entry['paths'];
  const pathsLabel = `${label}.paths`;
  validateStringArray(paths, pathsLabel);
  if (paths.length === 0) {
    throw configError(`"${pathsLabel}" needs at least one path glob`);
  }
  for (const glob of paths) {
    validateExceptionPath(glob, pathsLabel);
  }
  if (matchesOwnGlobs(textOf(entry['rule']))) {
    validateGlobs(paths, pathsLabel, filesFix);
  }
}

function validateNarrowing(entry: Entry, label: string): void {
  const rule = canonicalRule(textOf(entry['rule']));
  validateNarrowingKey(entry, label, {
    key: 'function',
    supported: FUNCTION_EXCEPTION_RULES,
    required: FUNCTION_REQUIRED_RULES,
    requiredText: `name the function whose uncovered branches are accepted. To accept a whole file, add it to "exclude"`,
  });
  validateNarrowingKey(entry, label, {
    key: 'name',
    supported: NAME_EXCEPTION_RULES,
    required: [],
  });
  if (entry['function'] !== undefined && entry['name'] !== undefined) {
    throw configError(`"${label}" takes either "function" or "name", not both (rule ${rule})`);
  }
}

function validateNarrowingKey(
  entry: Entry,
  label: string,
  {
    key,
    supported,
    required,
    requiredText = '',
  }: {
    readonly key: string;
    readonly supported: readonly string[];
    readonly required: readonly string[];
    readonly requiredText?: string;
  },
): void {
  const rule = canonicalRule(textOf(entry['rule']));
  const value = entry[key];
  if (value === undefined) {
    if (required.includes(rule)) {
      throw configError(
        `"${label}.${key}" is required for ${textOf(entry['rule'])}: ${requiredText}`,
      );
    }
    return;
  }
  if (!supported.includes(rule)) {
    throw configError(
      `"${label}.${key}" is only supported for these rules: ${supported.join(', ')}`,
    );
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw configError(`"${label}.${key}" must be a non-blank name`);
  }
}

function validatePackages(entry: Entry, label: string): void {
  if (!PACKAGE_EXCEPTION_RULES.includes(textOf(entry['rule']))) {
    throw configError(
      `"${label}.packages" is only for the rules ${PACKAGE_EXCEPTION_RULES.join(', ')}`,
    );
  }
  const packages = entry['packages'];
  validateStringArray(packages, `${label}.packages`);
  if (packages.length === 0) {
    throw configError(`"${label}.packages" needs at least one package name`);
  }
}
