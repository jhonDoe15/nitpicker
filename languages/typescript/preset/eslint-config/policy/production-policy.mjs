import regexp from 'eslint-plugin-regexp';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../../eslint-plugin/index.mjs';
import { domainGlobsFor } from '../strict/strict-domain.mjs';
import { SECURITY_RULES, securityRules, securitySupportGlobs } from './security-facts.mjs';

const JAVASCRIPT_FILES = '**/*.{js,jsx,mjs,cjs}';
const MAGIC_NUMBER_ALLOWED = [-1, 0, 1, 2, 10, 100, 1000];

const RANDOM_MESSAGE =
  'Math.random() is predictable, so it must not make ids or tokens: use crypto.randomUUID() or crypto.randomInt(), or take the random value as a parameter. An exception fits only for a simulation or UI jitter.';

const productionRestrictedProperties = [
  { object: 'Math', property: 'random', message: RANDOM_MESSAGE },
];

const DESTRUCTURED_FORMATS = ['camelCase', 'PascalCase', 'UPPER_CASE', 'snake_case'];

function withReactFormat(formats, react) {
  return react ? [...formats, 'PascalCase'] : formats;
}

const ROUTE_HANDLER_FRAMEWORKS = new Set(['next', '@sveltejs/kit', 'astro', '@solidjs/start']);

export function usesRouteHandlerFramework(dependencyNames) {
  return dependencyNames.some((name) => ROUTE_HANDLER_FRAMEWORKS.has(name));
}

const routeHandlerNames = {
  selector: 'function',
  modifiers: ['exported'],
  filter: { regex: '^(?:GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$', match: true },
  format: ['UPPER_CASE'],
};

function namingConvention({ react, routeHandlers }) {
  const underscores = 'allowSingleOrDouble';
  return [
    'error',
    ...(routeHandlers ? [routeHandlerNames] : []),
    { selector: 'typeLike', format: ['PascalCase'] },
    {
      selector: 'function',
      format: withReactFormat(['camelCase'], react),
      leadingUnderscore: underscores,
    },
    {
      selector: ['variable', 'parameter'],
      modifiers: ['destructured'],
      format: DESTRUCTURED_FORMATS,
    },
    {
      selector: 'variable',
      format: withReactFormat(['camelCase', 'UPPER_CASE'], react),
      leadingUnderscore: underscores,
    },
    { selector: 'parameter', format: ['camelCase'], leadingUnderscore: underscores },
  ];
}

function productionRules({ react, routeHandlers }) {
  return {
    curly: ['error', 'all'],
    'no-eval': 'error',
    'no-param-reassign': ['error', { props: false }],
    'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }],
    'no-restricted-properties': ['error', ...productionRestrictedProperties],
    'nitpicker/naming-convention': namingConvention({ react, routeHandlers }),
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
    'regexp/no-super-linear-backtracking': 'error',
  };
}

function productionGuardRules({ react, security }) {
  return {
    'nitpicker/no-process-access-outside-composition-root': [
      'error',
      { allowImportMetaEnv: react, allowBundlerEnv: react },
    ],
    'nitpicker/no-shell-string-command': 'error',
    'nitpicker/no-unsafe-path-join': 'error',
    ...securityRules({ react, security }),
  };
}

export function configFileGlobsFor(layout) {
  return layout.sourceRoots.flatMap((root) => [`${root}/**/*.config.*`, `${root}/**/.*rc.*`]);
}

export function productionLayoutConfigFor(layout, options = {}) {
  return [
    {
      files: layout.sourceGlobs,
      ignores: [...layout.testGlobs, ...layout.sourceTestDirectoryGlobs],
      plugins: { nitpicker: nitpickerRules },
      rules: {
        'nitpicker/no-unknown-main-folder': [
          'error',
          { sourceRoots: layout.sourceRoots, react: options.react === true },
        ],
      },
    },
  ];
}

export function productionPolicyConfigFor(layout, options = {}) {
  const production = {
    files: layout.sourceGlobs,
    ignores: [...layout.testGlobs, ...layout.sourceTestDirectoryGlobs],
  };
  return [
    {
      ...production,
      languageOptions: { parser: tseslint.parser },
      plugins: { '@typescript-eslint': tseslint.plugin, nitpicker: nitpickerRules, regexp },
      rules: {
        ...productionRules({
          react: options.react === true,
          routeHandlers: options.routeHandlers === true,
        }),
        ...productionGuardRules({ react: options.react === true, security: options.security }),
      },
    },
    {
      files: securitySupportGlobs(),
      plugins: { nitpicker: nitpickerRules },
      rules: Object.fromEntries(SECURITY_RULES.map((rule) => [rule, 'off'])),
    },
    {
      files: layout.sourceGlobs,
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
      files: layout.sourceGlobs,
      ignores: [...production.ignores, ...domainGlobsFor(layout.sourceRoots)],
      plugins: { nitpicker: nitpickerRules },
      rules: { 'nitpicker/no-module-level-mutable-state': 'error' },
    },
    {
      files: [...(layout.entryPoints ?? []), ...configFileGlobsFor(layout)],
      rules: { 'nitpicker/no-process-access-outside-composition-root': 'off' },
    },
  ];
}
