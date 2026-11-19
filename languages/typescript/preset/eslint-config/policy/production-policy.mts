import type { Linter } from 'eslint';
import regexp from 'eslint-plugin-regexp';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../../eslint-plugin/index.mts';
import { regexpRules } from '../regexp/regexp-rules.mts';
import { domainGlobsFor } from '../strict/strict-domain.mts';
import {
  learnedOptions,
  learnedRules,
  type LearnedConfig,
  type LearnedOptions,
} from './learned-options.mts';
import {
  SECURITY_RULES,
  httpClientOptions,
  securityRules,
  securitySupportGlobs,
  type SecurityFacts,
} from './security-facts.mts';

export type PolicyOptions = LearnedConfig & {
  readonly react?: unknown;
  readonly routeHandlers?: unknown;
  readonly security?: Partial<SecurityFacts> | undefined;
};

export type PolicyLayout = {
  readonly sourceGlobs: readonly string[];
  readonly testGlobs: readonly string[];
  readonly sourceTestDirectoryGlobs: readonly string[];
  readonly sourceRoots: readonly string[];
  readonly entryPoints?: readonly string[] | undefined;
};

type ProductionScope = { readonly react: boolean; readonly routeHandlers: boolean };

type RuleEntries = Record<string, Linter.RuleEntry>;

const JAVASCRIPT_FILES = '**/*.{js,jsx,mjs,cjs}';
const MAGIC_NUMBER_ALLOWED = [-1, 0, 1, 2, 10, 100, 1000];

const RANDOM_MESSAGE =
  'Math.random() is predictable, so it must not make ids or tokens: use crypto.randomUUID() or crypto.randomInt(), or take the random value as a parameter. An exception fits only for a simulation or UI jitter.';

const productionRestrictedProperties = [
  { object: 'Math', property: 'random', message: RANDOM_MESSAGE },
];

export const UNUSED_PARAMETERS = { args: 'all', argsIgnorePattern: '^_', ignoreRestSiblings: true };

const SUPPORT_OFF_RULES = [
  ...SECURITY_RULES,
  'nitpicker/no-hardcoded-secret',
  'nitpicker/no-secret-in-log',
  'nitpicker/timeout-abandons-operation',
  'nitpicker/require-client-timeout',
];

const CAMEL_CASE = 'camelCase';
const PASCAL_CASE = 'PascalCase';
const UPPER_CASE = 'UPPER_CASE';
const DESTRUCTURED_FORMATS = [CAMEL_CASE, PASCAL_CASE, UPPER_CASE, 'snake_case'];

function withReactFormat(formats: readonly string[], react: boolean): readonly string[] {
  return react ? [...formats, PASCAL_CASE] : formats;
}

const ROUTE_HANDLER_FRAMEWORKS = new Set(['next', '@sveltejs/kit', 'astro', '@solidjs/start']);

export function usesRouteHandlerFramework(dependencyNames: readonly string[]): boolean {
  return dependencyNames.some((name) => ROUTE_HANDLER_FRAMEWORKS.has(name));
}

const routeHandlerNames = {
  selector: 'function',
  modifiers: ['exported'],
  filter: { regex: '^(?:GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$', match: true },
  format: [UPPER_CASE],
};

export function namingConvention({
  react,
  routeHandlers,
}: ProductionScope): ['error', ...object[]] {
  const underscores = 'allowSingleOrDouble';
  return [
    'error',
    ...(routeHandlers ? [routeHandlerNames] : []),
    { selector: 'typeLike', format: [PASCAL_CASE] },
    {
      selector: 'function',
      format: withReactFormat([CAMEL_CASE], react),
      leadingUnderscore: underscores,
    },
    {
      selector: ['variable', 'parameter'],
      modifiers: ['destructured'],
      format: DESTRUCTURED_FORMATS,
    },
    {
      selector: 'variable',
      format: withReactFormat([CAMEL_CASE, UPPER_CASE], react),
      leadingUnderscore: underscores,
    },
    { selector: 'parameter', format: [CAMEL_CASE], leadingUnderscore: underscores },
  ];
}

function productionRules({ react, routeHandlers }: ProductionScope): RuleEntries {
  return {
    curly: ['error', 'all'],
    'no-eval': 'error',
    'no-param-reassign': ['error', { props: false }],
    '@typescript-eslint/no-unused-vars': ['error', UNUSED_PARAMETERS],
    'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }],
    'no-restricted-properties': ['error', ...productionRestrictedProperties],
    'nitpicker/naming-convention': namingConvention({ react, routeHandlers }),
    'nitpicker/no-accumulating-spread': 'error',
    'nitpicker/no-costly-collection-form': 'error',
    'nitpicker/no-collected-stream-rows': 'error',
    'nitpicker/no-wasted-collection-step': 'error',
    'nitpicker/no-raw-http-value': 'error',
    'nitpicker/no-repeated-string-literal': 'error',
    'nitpicker/no-hardcoded-secret': 'error',
    'nitpicker/no-secret-in-log': 'error',
    'nitpicker/no-unescaped-pattern-translation': 'error',
    'nitpicker/no-unescaped-filter-value': 'error',
    'nitpicker/no-unescaped-html-interpolation': 'error',
    'nitpicker/no-surrogate-splitting-cut': 'error',
    'nitpicker/no-newline-only-line-split': 'error',
    'nitpicker/no-host-port-colon-split': 'error',
    'nitpicker/no-ambiguous-lookup-key': 'error',
    'nitpicker/no-truncating-pair-split': 'error',
    'nitpicker/no-dropped-log-arguments': 'error',
    'nitpicker/no-magic-numbers': [
      'error',
      {
        ignore: MAGIC_NUMBER_ALLOWED,
        ignoreArrayIndexes: true,
        ignoreDefaultValues: true,
        ignoreEnums: true,
        ignoreNumericLiteralTypes: true,
        ignoreReadonlyClassProperties: true,
        ignoreTypeIndexes: true,
      },
    ],
    ...regexpRules(),
  };
}

function transactionGuardRules(): RuleEntries {
  return {
    'nitpicker/no-remote-call-in-transaction': 'error',
    'nitpicker/no-cache-write-in-transaction': 'error',
    'nitpicker/no-whole-rows-for-one-value': 'error',
    'nitpicker/no-remote-call-under-lock': 'error',
    'nitpicker/no-retry-without-idempotency': 'error',
    'nitpicker/no-stale-retry-after-conflict': 'error',
    'nitpicker/no-dual-write': 'error',
  };
}

function productionGuardRules({
  react,
  security,
  ...learned
}: LearnedOptions & {
  readonly react: boolean;
  readonly security: Partial<SecurityFacts> | undefined;
}): RuleEntries {
  return {
    'nitpicker/no-process-access-outside-composition-root': [
      'error',
      { allowImportMetaEnv: react, allowBundlerEnv: react },
    ],
    'nitpicker/no-io-in-loop': 'error',
    'nitpicker/no-unchecked-response-json': 'error',
    'nitpicker/no-wall-clock-elapsed': 'error',
    'nitpicker/no-overflowing-backoff': 'error',
    'nitpicker/no-index-bound-off-by-one': 'error',
    'nitpicker/no-negative-count': 'error',
    'nitpicker/no-nan-only-check': 'error',
    'nitpicker/no-accumulator-concat': 'error',
    'nitpicker/no-array-spread-arguments': 'error',
    'nitpicker/no-null-branch-fall-through': 'error',
    'nitpicker/no-lazy-relation-in-loop': 'error',
    'nitpicker/no-lookup-per-element': 'error',
    'nitpicker/no-query-per-parent': 'error',
    ...transactionGuardRules(),
    'nitpicker/no-unisolated-job-loop': 'error',
    'nitpicker/no-unguarded-deleted-items': 'error',
    'nitpicker/no-in-memory-query': 'error',
    'nitpicker/no-loaded-rows-saved-back': 'error',
    'nitpicker/no-multiple-collection-joins': 'error',
    'nitpicker/no-orm-query-logging': 'error',
    'nitpicker/no-orm-schema-sync': 'error',
    'nitpicker/no-unindexed-foreign-key': 'error',
    'nitpicker/no-shell-string-command': 'error',
    'nitpicker/require-process-timeout': 'error',
    'nitpicker/require-client-timeout': 'error',
    'nitpicker/time-unit-mismatch': 'error',
    'nitpicker/no-expanding-replacement-string': 'error',
    'nitpicker/no-sync-node-api-in-async': 'error',
    'nitpicker/no-unsafe-path-join': 'error',
    'nitpicker/no-prefix-without-boundary': 'error',
    'nitpicker/no-unanchored-affix-replace': 'error',
    'nitpicker/no-case-mismatched-lookup': 'error',
    'nitpicker/no-mismatched-precondition-message': 'error',
    'nitpicker/no-malformed-query-text': 'error',
    'nitpicker/no-unpaged-listing': 'error',
    'nitpicker/timeout-abandons-operation': ['error', httpClientOptions({ react, security })],
    'nitpicker/require-error-listener': 'error',
    'nitpicker/require-promise-reject': 'error',
    'nitpicker/promise-wait-deadline': 'error',
    'nitpicker/unbounded-fan-out': 'error',
    'nitpicker/unbounded-reactive-fan-out': 'error',
    ...learnedRules(learned),
    ...securityRules({ react, security }),
  };
}

export function configFileGlobsFor(layout: Pick<PolicyLayout, 'sourceRoots'>): string[] {
  return layout.sourceRoots.flatMap((root) => [`${root}/**/*.config.*`, `${root}/**/.*rc.*`]);
}

export function productionLayoutConfigFor(
  layout: PolicyLayout,
  options: PolicyOptions = {},
): Linter.Config[] {
  return [
    {
      files: [...layout.sourceGlobs],
      ignores: [...layout.testGlobs, ...layout.sourceTestDirectoryGlobs],
      plugins: { nitpicker: nitpickerRules },
      rules: {
        'nitpicker/no-generic-name': 'error',
        'nitpicker/no-unknown-main-folder': [
          'error',
          { sourceRoots: layout.sourceRoots, react: options.react === true },
        ],
      },
    },
  ];
}

function securitySupportOff(): Linter.Config {
  return {
    files: securitySupportGlobs(),
    plugins: { nitpicker: nitpickerRules },
    rules: Object.fromEntries(SUPPORT_OFF_RULES.map((rule) => [rule, 'off'])),
  };
}

function productionRulesConfig(options: PolicyOptions): Linter.Config {
  return {
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin, nitpicker: nitpickerRules, regexp },
    rules: {
      ...productionRules({
        react: options.react === true,
        routeHandlers: options.routeHandlers === true,
      }),
      ...productionGuardRules({
        react: options.react === true,
        security: options.security,
        ...learnedOptions(options),
      }),
    },
  };
}

export function productionPolicyConfigFor(
  layout: PolicyLayout,
  options: PolicyOptions = {},
): Linter.Config[] {
  const production = {
    files: [...layout.sourceGlobs],
    ignores: [...layout.testGlobs, ...layout.sourceTestDirectoryGlobs],
  };
  return [
    { ...production, ...productionRulesConfig(options) },
    securitySupportOff(),
    {
      files: [...layout.sourceGlobs],
      ignores: [...production.ignores, JAVASCRIPT_FILES],
      plugins: { '@typescript-eslint': tseslint.plugin },
      rules: {
        '@typescript-eslint/explicit-module-boundary-types': [
          'error',
          { allowArgumentsExplicitlyTypedAsAny: true },
        ],
      },
    },
    {
      files: [...layout.sourceGlobs],
      ignores: [...production.ignores, ...domainGlobsFor(layout.sourceRoots)],
      plugins: { nitpicker: nitpickerRules },
      rules: { 'nitpicker/no-module-level-mutable-state': 'error' },
    },
    {
      files: [...(layout.entryPoints ?? []), ...configFileGlobsFor(layout)],
      rules: { 'nitpicker/no-process-access-outside-composition-root': 'off' },
    },
    {
      files: configFileGlobsFor(layout),
      rules: { 'nitpicker/no-sync-node-api-in-async': 'off' },
    },
  ];
}
