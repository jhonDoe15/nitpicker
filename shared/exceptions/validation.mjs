import path from 'node:path';
import {
  configError,
  filesFix,
  isNonEmptyString,
  isPlainObject,
  validateGlobs,
  validateStringArray,
} from '../config.mjs';
import { PLACEHOLDER_REASONS } from '../messages/exception-sentence.mjs';
import {
  FUNCTION_EXCEPTION_RULES,
  FUNCTION_REQUIRED_RULES,
  NAME_EXCEPTION_RULES,
} from '../policy.mjs';
import { PACKAGE_EXCEPTION_RULES } from '../project-rules/hygiene-rules.mjs';
import { canonicalRule, toolPrefixError } from './rule-names.mjs';

const EXCEPTION_KEYS = ['rule', 'paths', 'packages', 'function', 'name', 'reason'];

const COMPILER_DIAGNOSTIC = /^(?:[\w-]+\/)?TS\d+$/u;

/** Whether every `exceptions` entry lifts one of `rules` (the file limits a non-ESLint preset honours). */
export function liftsOnlyRules(exceptions, rules) {
  return (
    Array.isArray(exceptions) &&
    exceptions.every(
      (entry) => typeof entry?.rule === 'string' && rules.includes(canonicalRule(entry.rule)),
    )
  );
}

export function validateExceptions(
  exceptions,
  name = 'exceptions',
  { preset, functionOptional = false, matchesOwnGlobs = () => true } = {},
) {
  if (!Array.isArray(exceptions)) {
    throw configError(`"${name}" must be an array`);
  }
  for (const [index, entry] of exceptions.entries()) {
    validateException(entry, `${name}[${String(index)}]`, {
      preset,
      functionOptional,
      matchesOwnGlobs,
    });
  }
}

function validateExceptionShape(entry, label) {
  if (!isPlainObject(entry)) {
    throw configError(`"${label}" must be an object`);
  }
  for (const key of Object.keys(entry)) {
    if (!EXCEPTION_KEYS.includes(key)) {
      throw configError(
        `unknown key "${key}" in "${label}". Allowed keys: ${EXCEPTION_KEYS.join(', ')}`,
      );
    }
  }
}

function validateExceptionRule(entry, label, preset) {
  if (!isNonEmptyString(entry.rule)) {
    throw configError(`"${label}.rule" must be a non-empty rule id`);
  }
  if (COMPILER_DIAGNOSTIC.test(entry.rule)) {
    throw configError(
      `"${label}.rule" is "${entry.rule}", a TypeScript compiler diagnostic: it has no exception, fix the type error`,
    );
  }
  const prefixError = toolPrefixError(entry.rule, preset);
  if (prefixError !== undefined) {
    throw configError(`"${label}.rule" has an ${prefixError}`);
  }
}

function validateExceptionReason(entry, label) {
  const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
  if (reason === '') {
    throw configError(`"${label}.reason" is required: say why the rule is lifted for these paths`);
  }
  if (PLACEHOLDER_REASONS.includes(reason)) {
    throw configError(
      `"${label}.reason" is the placeholder a message prints: say why this is intended`,
    );
  }
}

function validateException(entry, label, { preset, functionOptional, matchesOwnGlobs }) {
  validateExceptionShape(entry, label);
  validateExceptionRule(entry, label, preset);
  validateExceptionPaths(entry, label, matchesOwnGlobs);
  validateNarrowing(entry, label, functionOptional);
  validateExceptionReason(entry, label);
  if (entry.packages !== undefined) {
    validatePackages(entry, label);
  }
}

function validateExceptionPaths(entry, label, matchesOwnGlobs) {
  const paths = entry.paths;
  const pathsLabel = `${label}.paths`;
  validateStringArray(paths, pathsLabel);
  if (paths.length === 0) {
    throw configError(`"${pathsLabel}" needs at least one path glob`);
  }
  for (const glob of paths) {
    const normalized = glob.replaceAll('\\', '/');
    if (
      glob.trim() === '' ||
      path.isAbsolute(glob) ||
      /^[A-Za-z]:/u.test(glob) ||
      normalized.split('/').includes('..')
    ) {
      throw configError(
        `"${pathsLabel}" has "${glob}": use a glob relative to the project root, without \`..\``,
      );
    }
  }
  if (matchesOwnGlobs(entry.rule)) {
    validateGlobs(paths, pathsLabel, filesFix);
  }
}

function validateNarrowing(entry, label, functionOptional) {
  const rule = canonicalRule(entry.rule);
  validateNarrowingKey(entry, label, {
    key: 'function',
    supported: FUNCTION_EXCEPTION_RULES,
    required: functionOptional ? [] : FUNCTION_REQUIRED_RULES,
    requiredText: `name the function whose uncovered branches are accepted. To accept a whole file, add it to "exclude"`,
  });
  validateNarrowingKey(entry, label, {
    key: 'name',
    supported: NAME_EXCEPTION_RULES,
    required: [],
  });
  if (entry.function !== undefined && entry.name !== undefined) {
    throw configError(`"${label}" takes either "function" or "name", not both (rule ${rule})`);
  }
}

function validateNarrowingKey(entry, label, { key, supported, required, requiredText }) {
  const rule = canonicalRule(entry.rule);
  if (entry[key] === undefined) {
    if (required.includes(rule)) {
      throw configError(`"${label}.${key}" is required for ${entry.rule}: ${requiredText}`);
    }
    return;
  }
  if (!supported.includes(rule)) {
    throw configError(
      `"${label}.${key}" is only supported for these rules: ${supported.join(', ')}`,
    );
  }
  if (typeof entry[key] !== 'string' || entry[key].trim() === '') {
    throw configError(`"${label}.${key}" must be a non-blank name`);
  }
}

function validatePackages(entry, label) {
  if (!PACKAGE_EXCEPTION_RULES.includes(entry.rule)) {
    throw configError(
      `"${label}.packages" is only for the rules ${PACKAGE_EXCEPTION_RULES.join(', ')}`,
    );
  }
  validateStringArray(entry.packages, `${label}.packages`);
  if (entry.packages.length === 0) {
    throw configError(`"${label}.packages" needs at least one package name`);
  }
}
