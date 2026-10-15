import regexp from 'eslint-plugin-regexp';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../../eslint-plugin/index.mjs';
import { domainGlobsFor } from '../strict-domain.mjs';

const MAGIC_NUMBER_ALLOWED = [-1, 0, 1, 2];

const RANDOM_MESSAGE =
  'Math.random() is predictable, so it must not make ids or tokens: use crypto.randomUUID() or crypto.randomInt(), or take the random value as a parameter. For a simulation or UI jitter, add an exception for this rule in nitpicker.config.json.';

export const productionRestrictedProperties = [
  { object: 'Math', property: 'random', message: RANDOM_MESSAGE },
];

function namingConvention({ react }) {
  const underscores = 'allowSingleOrDouble';
  const withReact = (formats) => (react ? [...formats, 'PascalCase'] : formats);
  return [
    'error',
    { selector: 'typeLike', format: ['PascalCase'] },
    { selector: 'function', format: withReact(['camelCase']), leadingUnderscore: underscores },
    { selector: ['variable', 'parameter'], modifiers: ['destructured'], format: null },
    {
      selector: 'variable',
      format: withReact(['camelCase', 'UPPER_CASE']),
      leadingUnderscore: underscores,
    },
    { selector: 'parameter', format: ['camelCase'], leadingUnderscore: underscores },
  ];
}

function productionRules({ react }) {
  return {
    curly: ['error', 'all'],
    'no-eval': 'error',
    'no-param-reassign': ['error', { props: false }],
    'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }],
    'no-restricted-properties': ['error', ...productionRestrictedProperties],
    '@typescript-eslint/naming-convention': namingConvention({ react }),
    '@typescript-eslint/no-magic-numbers': [
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

export const productionGuardRules = {
  'nitpicker/no-process-access-outside-composition-root': 'error',
  'nitpicker/no-shell-string-command': 'error',
  'nitpicker/no-unsafe-path-join': 'error',
};

function configFileGlobsFor(layout) {
  return layout.sourceRoots.flatMap((root) => [`${root}/**/*.config.*`, `${root}/**/.*rc.*`]);
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
        ...productionRules({ react: options.react === true }),
        ...productionGuardRules,
        ...(options.react === true
          ? {}
          : { 'nitpicker/no-unknown-main-folder': ['error', { sourceRoots: layout.sourceRoots }] }),
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
