import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import vitest from '@vitest/eslint-plugin';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../eslint-plugin/index.mjs';
import { errorWrappingPolicy } from '../eslint-config/policies/error-wrapping-policy.mjs';
import { strictPresetConfig } from '../eslint-config/strict.mjs';
import {
  usesRouteHandlerFramework,
  productionLayoutConfigFor,
} from '../eslint-config/policy/production-policy.mjs';
import { applyRuleExceptions } from '../eslint-config/exceptions.mjs';
import {
  applyJavascriptDialect,
  javascriptRuleEntries,
} from '../../../javascript/preset/eslint-dialect.mjs';
import { reactRuleIds, reactTestRuleIds } from '../eslint-config/react/react-rules.mjs';
import {
  analyzedProjectRoot,
  isReactProject,
  reactScopeConfigFor,
} from '../eslint-config/react/react-scope.mjs';
import { readDependencyNames } from '../eslint-config/scope-support.mjs';
import { i18nRuleIds } from '../eslint-config/i18n/i18n-rules.mjs';
import { i18nScopeConfigFor, isI18nProject } from '../eslint-config/i18n/i18n-scope.mjs';
import { readHeadPolicy, readLayout } from '../head-policy.mjs';
import {
  testEnvironmentConfigFor,
  testEnvironmentsFromVariables,
} from '../test-environment/test-environment-config.mjs';

const policy = readHeadPolicy();

const layout = readLayout();
const react = isReactProject({ projectRoot: analyzedProjectRoot(), react: policy.react });
const routeHandlers = usesRouteHandlerFramework(readDependencyNames(analyzedProjectRoot()));
const i18n = isI18nProject({ projectRoot: analyzedProjectRoot(), i18n: policy.i18n });
const { sourceGlobs, testGlobs, excludedGlobs, unitTestGlobs } = layout;
const parserOptions = {
  project: './tsconfig.quality.json',
  tsconfigRootDir: import.meta.dirname,
};
const productionFiles = sourceGlobs;
const testFiles = [...testGlobs, ...layout.sourceTestDirectoryGlobs];
const selectedFiles = [...productionFiles, ...testFiles];

const presetConfig = defineConfig(
  {
    ignores: [...excludedGlobs, '.stryker-tmp/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: selectedFiles,
    languageOptions: {
      globals: globals.node,
      parserOptions,
    },
    plugins: {
      nitpicker: nitpickerRules,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { disallowTypeAnnotations: false, fixStyle: 'separate-type-imports' },
      ],
      'nitpicker/cognitive-complexity': ['error', 15],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true, 'ts-check': false },
      ],
    },
  },
  {
    files: productionFiles,
    ignores: testFiles,
    plugins: {
      nitpicker: nitpickerRules,
    },
    rules: {
      'nitpicker/no-managed-resource-construction-outside-composition-roots': 'error',
      'nitpicker/preserve-error-cause': ['error', errorWrappingPolicy],
    },
  },
  ...strictPresetConfig(layout, parserOptions, {
    react,
    routeHandlers,
    frameworkDefaultExports: policy.frameworks.defaultExports,
  }),
  ...productionLayoutConfigFor(layout, { react }),
  ...(layout.endToEndGlobs.length === 0
    ? []
    : [
        {
          files: layout.endToEndGlobs,
          rules: { 'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }] },
        },
      ]),
  ...(react ? await reactScopeConfigFor(layout, policy.react) : []),
  ...(i18n ? await i18nScopeConfigFor(layout, policy.i18n) : []),
  {
    // eslint-errors reports this rule for all production code; reporting it here too lists every
    files: productionFiles,
    ignores: testFiles,
    plugins: { nitpicker: nitpickerRules },
    rules: { 'nitpicker/no-silent-catch': 'off' },
  },
  {
    files: productionFiles,
    ignores: testFiles,
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    ...vitest.configs.recommended,
    files: testFiles,
    plugins: {
      ...vitest.configs.recommended.plugins,
      nitpicker: nitpickerRules,
    },
    languageOptions: {
      ...vitest.configs.env.languageOptions,
      globals: {
        ...globals.node,
        ...vitest.configs.env.languageOptions.globals,
      },
      parserOptions: {
        project: './tsconfig.quality.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...vitest.configs.recommended.rules,
      'nitpicker/integration-test-uses-approved-harness': 'error',
      'nitpicker/container-pause-requires-finally-unpause': 'error',
      'nitpicker/bounded-container-teardown': 'error',
      'nitpicker/no-fixed-sleep-synchronization': 'error',
      'nitpicker/no-interval-polling-in-tests': 'error',
      'nitpicker/no-mocking-subject-under-test': 'error',
      'nitpicker/no-internal-module-mocks': 'error',
      'nitpicker/no-wait-for-with-fake-timers': 'error',
      'nitpicker/no-partial-output-assertion': 'error',
      'nitpicker/test-must-use-production-runtime': 'error',
      'vitest/expect-expect': [
        'error',
        { assertFunctionNames: ['expect', 'assert', 'expectTypeOf', 'assertType'] },
      ],
      'vitest/no-conditional-in-test': 'error',
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
      'vitest/require-awaited-expect-poll': 'error',
      'vitest/valid-expect-in-promise': 'error',
    },
  },
  {
    files: unitTestGlobs,
    rules: { 'nitpicker/no-external-executables-in-unit-tests': 'error' },
  },
  ...testEnvironmentConfigFor(layout, testEnvironmentsFromVariables()),
);

const inactiveRuleIds = [
  ...(react ? [] : [...reactRuleIds, ...reactTestRuleIds]),
  ...(i18n ? [] : i18nRuleIds),
];
const applicableExceptions = policy.exceptions.filter(
  ({ rule }) => !inactiveRuleIds.includes(rule),
);

export default applyRuleExceptions(
  applyJavascriptDialect(
    [...presetConfig, ...javascriptRuleEntries(policy, selectedFiles)],
    policy,
  ),
  applicableExceptions,
);
