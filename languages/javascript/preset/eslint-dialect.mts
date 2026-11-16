import type { Linter } from 'eslint';
import {
  isJavascriptPolicy as untypedIsJavascriptPolicy,
  JAVASCRIPT_EXTENSIONS as untypedJavascriptExtensions,
  TYPESCRIPT_EXTENSIONS_IN_JAVASCRIPT_PROJECT as untypedTypescriptExtensions,
} from './javascript-preset.mjs';

type Setting = Linter.RuleEntry | undefined;
type Restriction = string | { readonly selector: string };

const isJavascriptPolicy: (policy: { readonly preset?: string } | undefined) => boolean =
  untypedIsJavascriptPolicy;
const JAVASCRIPT_EXTENSIONS: string[] = untypedJavascriptExtensions;
const TYPESCRIPT_EXTENSIONS_IN_JAVASCRIPT_PROJECT: string[] = untypedTypescriptExtensions;

const DROPPED_RULES = [
  '@typescript-eslint/consistent-type-definitions',
  '@typescript-eslint/consistent-type-imports',
  '@typescript-eslint/no-require-imports',
];

const PROPERTY_ASSIGNMENT_SELECTOR = "AssignmentExpression[left.type='MemberExpression']";

const SELECTOR_REWRITES = new Map([
  [
    PROPERTY_ASSIGNMENT_SELECTOR,
    `${PROPERTY_ASSIGNMENT_SELECTOR}:not([left.object.name='exports']):not([left.object.name='module'][left.property.name='exports']):not([left.object.object.name='module'][left.object.property.name='exports'])`,
  ],
]);

const JAVASCRIPT_FILES = `**/*.{${JAVASCRIPT_EXTENSIONS.join(',')}}`;
const TYPESCRIPT_FILES = `**/*.{${TYPESCRIPT_EXTENSIONS_IN_JAVASCRIPT_PROJECT.join(',')}}`;

export const JSDOC_RULE_OPTIONS: Record<string, object> = {
  'nitpicker/no-comments': { jsdocTypes: true },
  'nitpicker/no-unknown-in-domain': { jsdoc: true },
  'nitpicker/no-tri-state-boolean': { jsdoc: true },
  'nitpicker/no-boolean-flag-parameter': { jsdoc: true },
  'nitpicker/no-compatibility-shim': { jsdoc: true },
  'nitpicker/no-handwritten-boundary-guard': { jsdoc: true },
  'nitpicker/report-module-load-effects': { commonJsExports: true },
};

export const JAVASCRIPT_ONLY_RULES: Linter.RulesRecord = {
  'no-var': 'error',
  'prefer-const': 'error',
  'prefer-rest-params': 'error',
  'prefer-spread': 'error',
};

const TYPESCRIPT_SYNTAX_SELECTOR = /\bTS[A-Z]\w*/;
const SELECTOR_RULES = new Set(['no-restricted-syntax', 'nitpicker/no-null']);
const ACTIVE_SEVERITIES: readonly Linter.RuleSeverity[] = ['error', 'warn', 1, 2];

function selectorText(restriction: Restriction) {
  return typeof restriction === 'string' ? restriction : restriction.selector;
}

function dialectRestriction(restriction: Restriction): Restriction {
  const selector = selectorText(restriction);
  const rewritten = SELECTOR_REWRITES.get(selector);
  if (rewritten === undefined) {
    return restriction;
  }
  return typeof restriction === 'string' ? rewritten : { ...restriction, selector: rewritten };
}

function withoutTypeScriptSyntax([severity, ...restrictions]: readonly [
  Linter.RuleSeverity,
  ...Restriction[],
]): [Linter.RuleSeverity, ...Restriction[]] {
  return [
    severity,
    ...restrictions
      .filter((restriction) => !TYPESCRIPT_SYNTAX_SELECTOR.test(selectorText(restriction)))
      .map(dialectRestriction),
  ];
}

function isActiveSeverity(setting: Setting): setting is Linter.RuleSeverity {
  return ACTIVE_SEVERITIES.some((severity) => severity === setting);
}

function withOptions(setting: Setting, options: unknown): Setting {
  return isActiveSeverity(setting) ? [setting, options] : setting;
}

function dialectSetting(name: string, setting: Setting): Setting {
  if (SELECTOR_RULES.has(name) && Array.isArray(setting)) {
    return withoutTypeScriptSyntax(setting);
  }
  return Object.hasOwn(JSDOC_RULE_OPTIONS, name)
    ? withOptions(setting, JSDOC_RULE_OPTIONS[name])
    : setting;
}

function dialectRules(rules: Partial<Linter.RulesRecord>) {
  return Object.fromEntries(
    Object.entries(rules)
      .filter(([name]) => !DROPPED_RULES.includes(name))
      .map(([name, setting]) => [name, dialectSetting(name, setting)]),
  );
}

function restrictToFiles(entry: Linter.Config, glob: string): Linter.Config {
  const files =
    entry.files === undefined ? [glob] : entry.files.map((pattern) => [pattern, glob].flat());
  return { ...entry, files };
}

function dialectEntries(entry: Linter.Config): Linter.Config[] {
  if (entry.rules === undefined) {
    return [entry];
  }
  const rules = dialectRules(entry.rules);
  if (JSON.stringify(rules) === JSON.stringify(entry.rules)) {
    return [entry];
  }
  return [
    restrictToFiles(entry, TYPESCRIPT_FILES),
    restrictToFiles({ ...entry, rules }, JAVASCRIPT_FILES),
  ];
}

export function applyJavascriptDialect(
  entries: Linter.Config[],
  policy: { readonly preset?: string; readonly exceptions?: unknown[] } | undefined,
): Linter.Config[] {
  return isJavascriptPolicy(policy) ? entries.flatMap(dialectEntries) : entries;
}

export function scriptRuleEntries(files: readonly string[]): Linter.Config[] {
  return [{ files: [...files], rules: JAVASCRIPT_ONLY_RULES }];
}
