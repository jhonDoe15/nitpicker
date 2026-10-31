import { canonicalRule, isAddedRule } from '../../../../shared/exceptions/rule-names.mjs';
import { TYPESCRIPT_SIZE_RULES } from '../../../../shared/project-rules/size-rules.mjs';
import {
  MUTATION_EXCEPTION_RULES,
  SHARED_EXCEPTION_RULES,
  TEST_RUN_EXCEPTION_RULES,
  TYPESCRIPT_PROJECT_EXCEPTION_RULES,
} from '../../../../shared/policy.mjs';
import { PACKAGE_EXCEPTION_RULES } from '../../../../shared/project-rules/hygiene-rules.mjs';
import { strictBoundaryRules } from '../architecture/strict-boundary-rules.mjs';

export const RULE_EXCEPTION_ENTRY = 'nitpicker/rule-exception';

const boundaryRuleNames = strictBoundaryRules.map(({ name }) => name);

const NON_ESLINT_EXCEPTION_RULES = [
  ...SHARED_EXCEPTION_RULES,
  ...TYPESCRIPT_PROJECT_EXCEPTION_RULES,
  ...TYPESCRIPT_SIZE_RULES,
  ...MUTATION_EXCEPTION_RULES,
  ...TEST_RUN_EXCEPTION_RULES,
  ...PACKAGE_EXCEPTION_RULES,
];

function unknownRulesError(rules) {
  return new Error(
    `nitpicker.config.json "exceptions" name unknown rules: ${rules.join(', ')}. Only rules nitpicker runs, or rules the project ESLint config adds when tools.eslint.precedence lists "project", can be lifted: check the spelling.`,
  );
}

export function checkExceptionRules(configEntries, exceptionEntries) {
  const unknown = exceptionEntries
    .flatMap((entry) => Object.keys(entry.rules ?? {}))
    .filter((rule) => !isKnownRule(configEntries, rule));
  if (unknown.length > 0) {
    throw unknownRulesError([...new Set(unknown)]);
  }
}

export function applyRuleExceptions(
  configEntries,
  allExceptions = [],
  { projectRules = false } = {},
) {
  const exceptions = allExceptions.filter(
    ({ rule }) =>
      !isAddedRule(rule) &&
      !NON_ESLINT_EXCEPTION_RULES.includes(canonicalRule(rule)) &&
      !boundaryRuleNames.includes(rule),
  );
  const unknown = exceptions.filter(({ rule }) => !isKnownRule(configEntries, rule));
  if (!projectRules && unknown.length > 0) {
    throw unknownRulesError(unknown.map(({ rule }) => rule));
  }
  return [
    ...configEntries,
    ...exceptions.map(({ rule, paths }) => ({
      name: RULE_EXCEPTION_ENTRY,
      files: paths,
      rules: { [rule]: 'off' },
    })),
  ];
}

export function applyMatchingRuleExceptions(configEntries, exceptions = []) {
  return applyRuleExceptions(
    configEntries,
    exceptions.filter(({ rule }) => isKnownRule(configEntries, rule)),
  );
}

function isKnownRule(configEntries, rule) {
  const separator = rule.lastIndexOf('/');
  const pluginName = separator === -1 ? undefined : rule.slice(0, separator);
  const localName = separator === -1 ? rule : rule.slice(separator + 1);
  return configEntries.some(
    (entry) =>
      Object.hasOwn(entry.rules ?? {}, rule) ||
      (pluginName !== undefined && entry.plugins?.[pluginName]?.rules?.[localName] !== undefined),
  );
}
