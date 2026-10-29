import {
  configError,
  isPlainObject,
  validateProjectRelativePath,
} from '../../../../shared/config.mjs';
import { JAVA_SIZE_RULES } from '../../../../shared/project-rules/size-rules.mjs';
import { SHARED_EXCEPTION_RULES } from '../../../../shared/policy.mjs';
import { JAVA_TOOLS } from '../gradle-presets.mjs';
import {
  isJavaFindingRule,
  validateJavaFindingRule,
} from '../exception-rules/java-finding-rules.mjs';
import { canonicalRule } from '../../../../shared/exceptions/rule-names.mjs';
import { isKotlinFindingRule, KOTLIN_LISTED_RULES } from './rules/kotlin-messages.mjs';
import { SOURCE_RULE_IDS } from './rules/kotlin-rules.mjs';
import { TEST_ONLY_EXCEPTION_RULE } from '../review-rules/test-only-classes.mjs';
import { CONSOLE_EXCEPTION_RULE } from '../test-times/console-findings.mjs';
import { KOTLIN_REVIEW_EXCEPTION_RULES } from './review-rules/review-rules.mjs';
import { UNRUN_TEST_EXCEPTION_RULE } from '../test-runs/unrun-tests.mjs';

const KOTLIN_PRESET = 'kotlin';
const KOTLIN_RULE_ALIASES = new Map([['kotlin-source/IoCallInLoop', 'effects/IoCallInLoop']]);
export const KOTLIN_FORMATTERS = ['ktlint', 'ktfmt', 'none'];
const KOTLIN_KEYS = ['formatter', 'detektConfig'];
export const KOTLIN_EXCEPTION_RULES = [
  ...new Set([
    ...SOURCE_RULE_IDS,
    ...SHARED_EXCEPTION_RULES,
    ...JAVA_SIZE_RULES,
    'test-runtime/slow-test',
    CONSOLE_EXCEPTION_RULE,
    UNRUN_TEST_EXCEPTION_RULE,
    TEST_ONLY_EXCEPTION_RULE,
    ...KOTLIN_LISTED_RULES,
    ...KOTLIN_REVIEW_EXCEPTION_RULES,
  ]),
];

function aliasedEntries(config) {
  return config?.preset === KOTLIN_PRESET && Array.isArray(config.exceptions)
    ? config.exceptions.filter((entry) => KOTLIN_RULE_ALIASES.has(entry?.rule))
    : [];
}

export function withKotlinRuleAliases(config) {
  if (aliasedEntries(config).length === 0) {
    return config;
  }
  return {
    ...config,
    exceptions: config.exceptions.map((entry) =>
      KOTLIN_RULE_ALIASES.has(entry?.rule)
        ? { ...entry, rule: KOTLIN_RULE_ALIASES.get(entry.rule) }
        : entry,
    ),
  };
}

export function kotlinRuleAliasNotices(config) {
  const renamed = [...new Set(aliasedEntries(config).map(({ rule }) => rule))];
  return renamed.map(
    (rule) =>
      `The exception rule "${rule}" is now "${KOTLIN_RULE_ALIASES.get(rule)}": nitpicker reads the old name for now; rename it in nitpicker.config.json.`,
  );
}

function isKotlinExceptionRule(printed) {
  const rule = canonicalRule(printed);
  return isKotlinFindingRule(rule) || KOTLIN_EXCEPTION_RULES.includes(rule);
}

function validateKotlinExceptions(config) {
  if (config.preset !== KOTLIN_PRESET || !Array.isArray(config.exceptions)) {
    return;
  }
  for (const [index, entry] of config.exceptions.entries()) {
    const rule = isPlainObject(entry) ? entry.rule : undefined;
    if (typeof rule !== 'string' || rule === '' || isKotlinExceptionRule(rule)) {
      continue;
    }
    if (!isJavaFindingRule(rule)) {
      throw configError(
        `"exceptions[${String(index)}].rule" is "${rule}", which is not a rule with exceptions. Write the rule as the finding prints it; rules with exceptions for the kotlin preset: detekt.<ruleset>.<Rule>, ${KOTLIN_EXCEPTION_RULES.join(', ')}, and, for the Java sources of the project, a finding as it is printed, "<tool>/<rule>" (for example "pmd/UnusedPrivateField"; tools: ${JAVA_TOOLS.join(', ')})`,
      );
    }
    validateJavaFindingRule(entry, `exceptions[${String(index)}].rule`);
  }
}

export function validateKotlinOptions(config) {
  validateKotlinExceptions(config);
  if (config.kotlin === undefined) {
    return;
  }
  if (config.preset !== KOTLIN_PRESET) {
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
