import {
  configError,
  isPlainObject,
  validateProjectRelativePath,
} from '../../../../shared/config.mjs';
import { JAVA_SIZE_RULES } from '../../../../shared/project-rules/size-rules.mjs';
import { SHARED_EXCEPTION_RULES } from '../../../../shared/policy.mjs';
import { JAVA_TOOLS } from '../gradle-presets.mjs';
import { ONE_WAY_RULE_IDS, SOURCE_RULE_IDS } from './rules/kotlin-rules.mjs';
import { canonicalRule } from '../../../../shared/exceptions/rule-names.mjs';
import { TEST_ONLY_EXCEPTION_RULE } from '../review-rules/test-only-classes.mjs';
import { CONSOLE_EXCEPTION_RULE } from '../test-times/console-findings.mjs';
import { KOTLIN_REVIEW_EXCEPTION_RULES } from './review-rules/review-rules.mjs';

export const KOTLIN_FORMATTERS = ['ktlint', 'ktfmt', 'none'];
const KOTLIN_KEYS = ['formatter', 'detektConfig'];
export const KOTLIN_EXCEPTION_RULES = [
  ...ONE_WAY_RULE_IDS,
  ...SOURCE_RULE_IDS,
  ...SHARED_EXCEPTION_RULES,
  ...JAVA_SIZE_RULES,
  'test-runtime/slow-test',
  CONSOLE_EXCEPTION_RULE,
  TEST_ONLY_EXCEPTION_RULE,
  ...KOTLIN_REVIEW_EXCEPTION_RULES,
];

function validateKotlinExceptions(config) {
  if (config.preset !== 'kotlin' || !Array.isArray(config.exceptions)) {
    return;
  }
  for (const [index, entry] of config.exceptions.entries()) {
    const rule = isPlainObject(entry) ? entry.rule : undefined;
    if (typeof rule === 'string' && rule !== '' && !isKotlinExceptionRule(rule)) {
      throw configError(
        `"exceptions[${String(index)}].rule" is "${rule}", which is not a rule with exceptions. Rules with exceptions for the kotlin preset: ${KOTLIN_EXCEPTION_RULES.join(', ')}, and, for the Java sources of the project, a finding as it is printed, "<tool>/<rule>" (for example "pmd/UnusedPrivateField"; tools: ${JAVA_TOOLS.join(', ')}). Tune any other detekt rule in config/detekt/detekt.yml`,
      );
    }
  }
}

function isKotlinExceptionRule(rule) {
  const [tool] = rule.split('/');
  return (
    KOTLIN_EXCEPTION_RULES.includes(canonicalRule(rule)) ||
    (JAVA_TOOLS.includes(tool) && rule.length > tool.length + 1)
  );
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
