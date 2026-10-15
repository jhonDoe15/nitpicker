import path from 'node:path';
import ts from 'typescript';
import {
  isJavascriptPolicy,
  JAVASCRIPT_EXTENSIONS,
  TYPESCRIPT_EXTENSIONS_IN_JAVASCRIPT_PROJECT,
} from './javascript-preset.mjs';

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
const UNTYPED_SCRIPT_FILES = `**/*.{${[...JAVASCRIPT_EXTENSIONS, 'jsx'].join(',')}}`;
export const UNTYPED_VALUE_RULES = [
  'no-unsafe-argument',
  'no-unsafe-assignment',
  'no-unsafe-call',
  'no-unsafe-member-access',
  'no-unsafe-return',
  'restrict-plus-operands',
  'restrict-template-expressions',
].map((rule) => `@typescript-eslint/${rule}`);
const TYPESCRIPT_FILES = `**/*.{${TYPESCRIPT_EXTENSIONS_IN_JAVASCRIPT_PROJECT.join(',')}}`;

export const JSDOC_RULE_OPTIONS = {
  'nitpicker/no-comments': { jsdocTypes: true },
  'nitpicker/no-unknown-in-domain': { jsdoc: true },
  'nitpicker/no-handwritten-boundary-guard': { jsdoc: true },
  'nitpicker/report-module-load-effects': { commonJsExports: true },
};

export const JAVASCRIPT_ONLY_RULES = {
  'no-var': 'error',
  'prefer-const': 'error',
  'prefer-rest-params': 'error',
  'prefer-spread': 'error',
};

const TYPESCRIPT_SYNTAX_SELECTOR = /\bTS[A-Z]\w*/;
const ACTIVE_SEVERITIES = ['error', 'warn', 1, 2];

function selectorText(restriction) {
  return typeof restriction === 'string' ? restriction : restriction.selector;
}

function dialectRestriction(restriction) {
  const selector = selectorText(restriction);
  const rewritten = SELECTOR_REWRITES.get(selector);
  if (rewritten === undefined) {
    return restriction;
  }
  return typeof restriction === 'string' ? rewritten : { ...restriction, selector: rewritten };
}

function withoutTypeScriptSyntax([severity, ...restrictions]) {
  return [
    severity,
    ...restrictions
      .filter((restriction) => !TYPESCRIPT_SYNTAX_SELECTOR.test(selectorText(restriction)))
      .map(dialectRestriction),
  ];
}

function withOptions(setting, options) {
  return ACTIVE_SEVERITIES.includes(setting) ? [setting, options] : setting;
}

function dialectSetting(name, setting) {
  if (name === 'no-restricted-syntax' && Array.isArray(setting)) {
    return withoutTypeScriptSyntax(setting);
  }
  return Object.hasOwn(JSDOC_RULE_OPTIONS, name)
    ? withOptions(setting, JSDOC_RULE_OPTIONS[name])
    : setting;
}

function dialectRules(rules) {
  return Object.fromEntries(
    Object.entries(rules)
      .filter(([name]) => !DROPPED_RULES.includes(name))
      .map(([name, setting]) => [name, dialectSetting(name, setting)]),
  );
}

function restrictToFiles(entry, glob) {
  const files =
    entry.files === undefined ? [glob] : entry.files.map((pattern) => [pattern, glob].flat());
  return { ...entry, files };
}

function dialectEntries(entry) {
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

export function applyJavascriptDialect(entries, policy) {
  return isJavascriptPolicy(policy) ? entries.flatMap(dialectEntries) : entries;
}

export function scriptRuleEntries(files) {
  return [{ files, rules: JAVASCRIPT_ONLY_RULES }];
}

export function projectChecksJavascript(projectRoot) {
  const file = path.join(projectRoot, 'tsconfig.json');
  const { config } = ts.readConfigFile(file, ts.sys.readFile);
  const host = { ...ts.sys, readDirectory: () => [] };
  return ts.parseJsonConfigFileContent(config ?? {}, host, projectRoot).options.checkJs === true;
}

export function untypedScriptEntries(policy, checksJavascript) {
  return isJavascriptPolicy(policy) || checksJavascript
    ? []
    : [
        {
          files: [UNTYPED_SCRIPT_FILES],
          rules: Object.fromEntries(UNTYPED_VALUE_RULES.map((rule) => [rule, 'off'])),
        },
      ];
}
