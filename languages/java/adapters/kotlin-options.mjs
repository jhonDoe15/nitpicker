import {
  configError,
  isPlainObject,
  validateProjectRelativePath,
} from '../../../shared/config.mjs';
import {
  JAVA_NATIVE_RULES,
  SHARED_EXCEPTION_RULES,
  canonicalRule,
} from '../../../shared/policy.mjs';
import { ONE_WAY_RULE_IDS } from './kotlin-rules.mjs';

export const KOTLIN_FORMATTERS = ['ktlint', 'ktfmt', 'none'];
const KOTLIN_KEYS = ['formatter', 'detektConfig'];
export const KOTLIN_EXCEPTION_RULES = [
  ...ONE_WAY_RULE_IDS,
  ...SHARED_EXCEPTION_RULES.filter((rule) => !JAVA_NATIVE_RULES.includes(rule)),
];

function validateKotlinExceptions(config) {
  if (config.preset !== 'kotlin' || !Array.isArray(config.exceptions)) {
    return;
  }
  for (const [index, entry] of config.exceptions.entries()) {
    const rule = isPlainObject(entry) ? entry.rule : undefined;
    if (
      typeof rule === 'string' &&
      rule !== '' &&
      !KOTLIN_EXCEPTION_RULES.includes(canonicalRule(rule))
    ) {
      throw configError(
        `"exceptions[${String(index)}].rule" is "${rule}", which is not a rule with exceptions. Rules with exceptions for the kotlin preset: ${KOTLIN_EXCEPTION_RULES.join(', ')}. Tune any other detekt rule in config/detekt/detekt.yml`,
      );
    }
  }
}

export function validateKotlinOptions(config) {
  validateKotlinExceptions(config);
  if (config.kotlin === undefined) {
    return;
  }
  if (config.preset !== 'kotlin') {
    throw configError('"kotlin" is only supported with "preset": "kotlin"');
  }
  if (!isPlainObject(config.kotlin)) {
    throw configError('"kotlin" must be an object');
  }
  for (const key of Object.keys(config.kotlin)) {
    if (!KOTLIN_KEYS.includes(key)) {
      throw configError(`unknown key "kotlin.${key}". Allowed keys: ${KOTLIN_KEYS.join(', ')}`);
    }
  }
  const { formatter, detektConfig } = config.kotlin;
  if (formatter !== undefined && !KOTLIN_FORMATTERS.includes(formatter)) {
    throw configError(`"kotlin.formatter" must be one of: ${KOTLIN_FORMATTERS.join(', ')}`);
  }
  if (detektConfig !== undefined) {
    validateProjectRelativePath(detektConfig, 'kotlin.detektConfig');
  }
}
