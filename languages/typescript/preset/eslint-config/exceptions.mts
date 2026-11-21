import type { Linter } from 'eslint';
import {
  canonicalRule as untypedCanonicalRule,
  isAddedRule as untypedIsAddedRule,
} from '../../../../shared/exceptions/rule-names.mts';
import { TYPESCRIPT_SIZE_RULES } from '../../../../shared/project-rules/size-rules.mts';
import {
  MUTATION_EXCEPTION_RULES,
  SHARED_EXCEPTION_RULES,
  TEST_RUN_EXCEPTION_RULES,
  TYPESCRIPT_PROJECT_EXCEPTION_RULES as untypedProjectExceptionRules,
} from '../../../../shared/policy.mts';
import { PACKAGE_EXCEPTION_RULES as untypedPackageExceptionRules } from '../../../../shared/project-rules/hygiene-rules.mts';
import { strictBoundaryRules } from '../architecture/strict-boundary-rules.mts';

export type ExceptionRule = {
  readonly rule: string;
  readonly paths: readonly string[];
  readonly reason?: string;
};

const canonicalRule: (rule: string) => string = untypedCanonicalRule;
const isAddedRule: (rule: string) => boolean = untypedIsAddedRule;
const TYPESCRIPT_PROJECT_EXCEPTION_RULES: readonly string[] = untypedProjectExceptionRules;
const PACKAGE_EXCEPTION_RULES: readonly string[] = untypedPackageExceptionRules;

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

function unknownRulesError(rules: readonly string[]): Error {
  return new Error(
    `nitpicker.config.json "exceptions" name unknown rules: ${rules.join(', ')}. Only rules nitpicker runs, or rules the project ESLint config adds when tools.eslint.precedence lists "project", can be lifted: check the spelling.`,
  );
}

export function checkExceptionRules(
  configEntries: readonly Linter.Config[],
  exceptionEntries: readonly Linter.Config[],
): void {
  const unknown = exceptionEntries
    .flatMap((entry) => Object.keys(entry.rules ?? {}))
    .filter((rule) => !isKnownRule(configEntries, rule));
  if (unknown.length > 0) {
    throw unknownRulesError([...new Set(unknown)]);
  }
}

function withoutEmptyFileBlocks(configEntries: readonly Linter.Config[]): Linter.Config[] {
  return configEntries.filter(({ files }) => !Array.isArray(files) || files.length > 0);
}

export function applyRuleExceptions(
  configEntries: readonly Linter.Config[],
  allExceptions: readonly ExceptionRule[] = [],
  { projectRules }: { readonly projectRules?: true } = {},
): Linter.Config[] {
  const exceptions = allExceptions.filter(
    ({ rule }) =>
      !(
        isAddedRule(rule) ||
        NON_ESLINT_EXCEPTION_RULES.includes(canonicalRule(rule)) ||
        boundaryRuleNames.includes(rule)
      ),
  );
  const unknown = exceptions.filter(({ rule }) => !isKnownRule(configEntries, rule));
  if (!projectRules && unknown.length > 0) {
    throw unknownRulesError(unknown.map(({ rule }) => rule));
  }
  return withoutEmptyFileBlocks([
    ...configEntries,
    ...exceptions.map(({ rule, paths }) => ({
      name: RULE_EXCEPTION_ENTRY,
      files: [...paths],
      rules: { [rule]: 'off' as const },
    })),
  ]);
}

export function applyMatchingRuleExceptions(
  configEntries: readonly Linter.Config[],
  exceptions: readonly ExceptionRule[] = [],
): Linter.Config[] {
  return applyRuleExceptions(
    configEntries,
    exceptions.filter(({ rule }) => isKnownRule(configEntries, rule)),
  );
}

function isKnownRule(configEntries: readonly Linter.Config[], rule: string): boolean {
  const separator = rule.lastIndexOf('/');
  const pluginName = separator === -1 ? undefined : rule.slice(0, separator);
  const localName = separator === -1 ? rule : rule.slice(separator + 1);
  return configEntries.some(
    (entry) =>
      Object.hasOwn(entry.rules ?? {}, rule) ||
      (pluginName !== undefined && entry.plugins?.[pluginName]?.rules?.[localName] !== undefined),
  );
}
