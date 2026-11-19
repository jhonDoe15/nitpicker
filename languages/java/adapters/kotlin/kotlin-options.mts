import { configError, validateProjectRelativePath } from '../../../../shared/config.mjs';
import { JAVA_SIZE_RULES } from '../../../../shared/project-rules/size-rules.mjs';
import { SHARED_EXCEPTION_RULES } from '../../../../shared/policy.mjs';
import { SPRING_CONFIG_RULE_IDS } from '../spring/java-spring.mts';
import { JAVA_TOOLS } from '../gradle-presets.mts';
import {
  isJavaFindingRule,
  validateJavaFindingRule,
} from '../exception-rules/java-finding-rules.mts';
import { canonicalRule } from '../../../../shared/exceptions/rule-names.mjs';
import { isKotlinFindingRule, KOTLIN_LISTED_RULES } from './rules/kotlin-messages.mts';
import { SOURCE_RULE_IDS } from './rules/kotlin-rules.mts';
import { TEST_ONLY_EXCEPTION_RULE } from '../review-rules/test-only/test-only-classes.mts';
import { CONSOLE_EXCEPTION_RULE } from '../test-times/console-findings.mts';
import { KOTLIN_REVIEW_EXCEPTION_RULES } from './review-rules/review-rules.mts';
import { UNRUN_TEST_EXCEPTION_RULE } from '../test-runs/unrun-tests.mts';
import { ROUND_TRIP_EXCEPTION_RULE } from '../review-rules/round-trips/round-trips.mts';
import { COPIED_CONSTANT_EXCEPTION_RULE } from '../review-rules/copied-constants/copied-constants.mts';
import { MAX_VALUE_EXCEPTION_RULE } from '../review-rules/max-value-sums/max-value-sums.mts';
import { NULL_FALL_THROUGH_EXCEPTION_RULE } from '../review-rules/null-fall-through/null-fall-through.mts';
import { SELF_RECURSION_EXCEPTION_RULE } from '../review-rules/self-recursion/self-recursion.mts';
import {
  fieldOf,
  fieldsOf,
  isPlainObject,
  listOf,
  textOf,
} from '../../../../shared/values/readers.mts';
import { suggestionOrAllowed } from '../../../../shared/messages/closest-match.mjs';

const canonical: (rule: string) => string = canonicalRule;
const isKotlinFinding: (rule: string) => boolean = isKotlinFindingRule;

const EXCEPTIONS = 'exceptions';
const PRESET = 'preset';
const KOTLIN_PRESET = 'kotlin';
const KOTLIN_RULE_ALIASES = new Map<string, string>([
  ['kotlin-source/IoCallInLoop', 'effects/IoCallInLoop'],
]);
export const KOTLIN_DEPRECATED_RULES: string[] = [...KOTLIN_RULE_ALIASES.keys()];
export const KOTLIN_FORMATTERS: string[] = ['ktlint', 'ktfmt', 'none'];
export const KOTLIN_KEYS: string[] = ['formatter', 'detektConfig'];
export const KOTLIN_EXCEPTION_RULES: string[] = [
  ...new Set([
    ...SOURCE_RULE_IDS,
    ...SPRING_CONFIG_RULE_IDS,
    ...SHARED_EXCEPTION_RULES,
    ...JAVA_SIZE_RULES,
    'test-runtime/slow-test',
    CONSOLE_EXCEPTION_RULE,
    UNRUN_TEST_EXCEPTION_RULE,
    TEST_ONLY_EXCEPTION_RULE,
    ROUND_TRIP_EXCEPTION_RULE,
    COPIED_CONSTANT_EXCEPTION_RULE,
    MAX_VALUE_EXCEPTION_RULE,
    NULL_FALL_THROUGH_EXCEPTION_RULE,
    SELF_RECURSION_EXCEPTION_RULE,
    ...KOTLIN_LISTED_RULES,
    ...KOTLIN_REVIEW_EXCEPTION_RULES,
  ]),
];

function aliasOf(entry: unknown): string | undefined {
  const rule = fieldOf(entry, 'rule');
  return typeof rule === 'string' ? KOTLIN_RULE_ALIASES.get(rule) : undefined;
}

function aliasedEntries(config: unknown): unknown[] {
  return fieldOf(config, PRESET) === KOTLIN_PRESET && Array.isArray(fieldOf(config, EXCEPTIONS))
    ? listOf(fieldOf(config, EXCEPTIONS)).filter((entry) => aliasOf(entry) !== undefined)
    : [];
}

export function withKotlinRuleAliases(config: Record<string, unknown>): Record<string, unknown>;
export function withKotlinRuleAliases(config: unknown): unknown;
export function withKotlinRuleAliases(config: unknown): unknown {
  if (aliasedEntries(config).length === 0) {
    return config;
  }
  return {
    ...fieldsOf(config),
    exceptions: listOf(fieldOf(config, EXCEPTIONS)).map((entry) => {
      const alias = aliasOf(entry);
      return alias === undefined ? entry : { ...fieldsOf(entry), rule: alias };
    }),
  };
}

export function kotlinRuleAliasNotices(config: unknown): string[] {
  const renamed = [
    ...new Set(aliasedEntries(config).map((entry) => textOf(fieldOf(entry, 'rule')))),
  ];
  return renamed.map(
    (rule) =>
      `The exception rule "${rule}" is now "${textOf(KOTLIN_RULE_ALIASES.get(rule))}": nitpicker reads the old name for now; rename it in nitpicker.config.json.`,
  );
}

function isKotlinExceptionRule(printed: string): boolean {
  const rule = canonical(printed);
  return isKotlinFinding(rule) || KOTLIN_EXCEPTION_RULES.includes(rule);
}

function validateKotlinExceptions(config: unknown): void {
  const exceptions = fieldOf(config, EXCEPTIONS);
  if (fieldOf(config, PRESET) !== KOTLIN_PRESET || !Array.isArray(exceptions)) {
    return;
  }
  for (const [index, entry] of listOf(exceptions).entries()) {
    const rule = isPlainObject(entry) ? entry['rule'] : undefined;
    if (typeof rule !== 'string' || rule === '' || isKotlinExceptionRule(rule)) {
      continue;
    }
    if (!isJavaFindingRule(rule)) {
      throw configError(
        `"exceptions[${String(index)}].rule" is "${rule}", which is not a rule with exceptions. Write the rule as the finding prints it; rules with exceptions for the kotlin preset: detekt.<ruleset>.<Rule>, ${KOTLIN_EXCEPTION_RULES.join(', ')}, and, for the Java sources of the project, a finding as it is printed, "<tool>/<rule>" (for example "pmd/UnusedPrivateField"; tools: ${JAVA_TOOLS.join(', ')})`,
      );
    }
    validateJavaFindingRule(
      { rule, paths: fieldOf(entry, 'paths') },
      `exceptions[${String(index)}].rule`,
    );
  }
}

export function validateKotlinOptions(config: unknown): void {
  validateKotlinExceptions(config);
  const kotlin = fieldOf(config, 'kotlin');
  if (kotlin === undefined) {
    return;
  }
  if (fieldOf(config, PRESET) !== KOTLIN_PRESET) {
    throw configError('"kotlin" is only supported with "preset": "kotlin"');
  }
  if (!isPlainObject(kotlin)) {
    throw configError('"kotlin" must be an object');
  }
  validateKotlinFields(kotlin);
}

function validateKotlinFields(kotlin: Readonly<Record<string, unknown>>): void {
  for (const key of Object.keys(kotlin)) {
    if (!KOTLIN_KEYS.includes(key)) {
      throw configError(`unknown key "kotlin.${key}"${suggestionOrAllowed(key, KOTLIN_KEYS)}`);
    }
  }
  const { formatter, detektConfig } = kotlin;
  if (
    formatter !== undefined &&
    !(typeof formatter === 'string' && KOTLIN_FORMATTERS.includes(formatter))
  ) {
    throw configError(`"kotlin.formatter" must be one of: ${KOTLIN_FORMATTERS.join(', ')}`);
  }
  if (detektConfig !== undefined) {
    validateProjectRelativePath(detektConfig, 'kotlin.detektConfig');
  }
}
