import path from 'node:path';
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import {
  UNUSED_PARAMETERS,
  analyzedProjectRoot,
  applyJavascriptDialect,
  applyRuleExceptions,
  assertionFunctionNames,
  detachedWorkRunnerNames,
  domProductionConfigFor,
  errorWrappingPolicy,
  existingRoots,
  fileNameRuleOptions,
  i18nRuleIds,
  i18nScopeConfigFor,
  isI18nProject,
  isNestProject,
  isReactProject,
  isServerProject,
  logicConfigFor,
  nestScopeConfigFor,
  nitpickerRules,
  policyTestRunner,
  precedenceLayers,
  productionLayoutConfigFor,
  reactRuleIds,
  reactScopeConfigFor,
  reactTestRuleIds,
  readDependencyNames,
  readHeadPolicy,
  readLayout,
  scriptRuleEntries,
  securityFactsFor,
  serverRuleIds,
  serverScopeConfigFor,
  setupFilesIn,
  strictPresetConfig,
  stubRestoresIn,
  testEnvironmentConfigFor,
  testEnvironmentsFromVariables,
  testHonestyConfigFor,
  testRunnerLintConfig,
  typeImportFixStyle,
  untypedJavascriptConfig,
  usesRouteHandlerFramework,
  withRunnerTestPaths,
  type Entry,
  type ParserOptions,
} from './eslint-inputs.mts';

const policy = readHeadPolicy();
const testRunner = policyTestRunner(policy, analyzedProjectRoot());
const runnerConfig = testRunnerLintConfig(testRunner, assertionFunctionNames(policy.conventions));

const layout = withRunnerTestPaths(readLayout(), analyzedProjectRoot());
const react = isReactProject({
  projectRoot: analyzedProjectRoot(),
  react: policy.react,
  javascript: layout.javascript,
});
const routeHandlers = usesRouteHandlerFramework(readDependencyNames(analyzedProjectRoot()));
const i18n = isI18nProject({
  projectRoot: analyzedProjectRoot(),
  i18n: policy.i18n,
  javascript: layout.javascript,
});
const testEnvironments = testEnvironmentsFromVariables(process.env);
const security = securityFactsFor(analyzedProjectRoot(), (file) => layout.isSourceFile(file));
const server = isServerProject(analyzedProjectRoot());
const nest = isNestProject(analyzedProjectRoot());
const { sourceGlobs, testGlobs, excludedGlobs, unitTestGlobs } = layout;
const parserOptions: ParserOptions = {
  project: './tsconfig.quality.json',
  tsconfigRootDir: import.meta.dirname,
};
const productionFiles = [...sourceGlobs];
const testFiles = [...testGlobs, ...layout.sourceTestDirectoryGlobs];
const VITEST_TYPE_TEST_FILES = ['**/*.{test,spec}-d.?(c|m)[jt]s?(x)'];
const selectedFiles = [...productionFiles, ...testFiles];
const vitestTypeTestEntries: Entry[] = [
  { files: VITEST_TYPE_TEST_FILES, rules: { 'vitest/expect-expect': 'off' } },
];

const endToEndEntries: Entry[] =
  layout.endToEndGlobs.length === 0
    ? []
    : [
        {
          files: [...layout.endToEndGlobs],
          rules: {
            'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }],
          },
        },
      ];

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
        { disallowTypeAnnotations: false, fixStyle: typeImportFixStyle(policy.conventions) },
      ],
      'nitpicker/file-name-casing': ['error', fileNameRuleOptions(policy)],
      'nitpicker/cognitive-complexity': ['error', 15],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true, 'ts-check': false },
      ],
    },
  },
  ...untypedJavascriptConfig({
    tsconfigFile: path.join(analyzedProjectRoot(), layout.typescriptProject ?? 'tsconfig.json'),
    projectRoot: analyzedProjectRoot(),
    layout,
  }),
  ...logicConfigFor(selectedFiles, parserOptions),
  {
    files: productionFiles,
    ignores: testFiles,
    plugins: {
      nitpicker: nitpickerRules,
    },
    rules: {
      'nitpicker/no-dev-dependency-in-production': 'error',
      'nitpicker/no-managed-resource-construction-outside-composition-roots': 'error',
      'nitpicker/contract-infrastructure-type': 'error',
      'nitpicker/handler-entity-type': 'error',
      'nitpicker/preserve-error-cause': ['error', errorWrappingPolicy],
    },
  },
  ...strictPresetConfig(layout, parserOptions, {
    react,
    nest,
    routeHandlers,
    security,
    frameworkDefaultExports: policy.frameworks.defaultExports,
    detachedWorkRunners: detachedWorkRunnerNames(policy.conventions),
  }),
  ...productionLayoutConfigFor(layout, { react }),
  ...endToEndEntries,
  ...(react ? await reactScopeConfigFor(layout, policy.react) : []),
  ...(i18n ? await i18nScopeConfigFor(layout, policy.i18n) : []),
  ...(server ? serverScopeConfigFor(layout, { browser: react || security.browser }) : []),
  ...(nest ? nestScopeConfigFor(selectedFiles) : []),
  {
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
    files: testFiles,
    plugins: {
      ...runnerConfig.plugins,
      nitpicker: nitpickerRules,
    },
    settings: runnerConfig.settings,
    languageOptions: {
      globals: {
        ...globals.node,
        ...runnerConfig.globals,
      },
      parserOptions: {
        project: './tsconfig.quality.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...runnerConfig.rules,
      ...runnerConfig.typedRules,
      '@typescript-eslint/no-unused-vars': ['error', UNUSED_PARAMETERS],
      'nitpicker/integration-test-uses-approved-harness': 'error',
      'nitpicker/container-pause-requires-finally-unpause': 'error',
      'nitpicker/bounded-container-teardown': 'error',
      'nitpicker/no-fixed-sleep-synchronization': ['error', { runner: testRunner }],
      'nitpicker/no-interval-polling-in-tests': ['error', { runner: testRunner }],
      'nitpicker/no-mocking-subject-under-test': 'error',
      'nitpicker/no-internal-module-mocks': 'error',
      'nitpicker/no-wait-for-with-fake-timers': 'error',
      'nitpicker/no-partial-output-assertion': ['error', { runner: testRunner }],
      'nitpicker/test-must-use-production-runtime': ['error', { runner: testRunner }],
    },
  },
  ...(testRunner === 'vitest' ? vitestTypeTestEntries : []),
  {
    files: [...unitTestGlobs],
    rules: { 'nitpicker/no-external-executables-in-unit-tests': 'error' },
  },
  ...testHonestyConfigFor(layout, {
    runner: testRunner,
    assertionFunctionNames: assertionFunctionNames(policy.conventions),
    setupFiles: setupFilesIn(analyzedProjectRoot(), testRunner),
    stubRestores: stubRestoresIn(analyzedProjectRoot()),
    testRootsOnDisk: existingRoots(analyzedProjectRoot(), layout.testRoots),
  }),
  ...testEnvironmentConfigFor(layout, testEnvironments, testRunner),
  ...(react ? [] : domProductionConfigFor(layout, testEnvironments, analyzedProjectRoot())),
);

const inactiveRuleIds = [
  ...(react ? [] : [...reactRuleIds, ...reactTestRuleIds]),
  ...(i18n ? [] : i18nRuleIds),
  ...(server ? [] : serverRuleIds),
];
const applicableExceptions = policy.exceptions.filter(
  ({ rule }) => !inactiveRuleIds.includes(rule),
);

export default applyRuleExceptions(
  applyJavascriptDialect([...presetConfig, ...scriptRuleEntries(selectedFiles)], policy),
  applicableExceptions,
  { projectRules: precedenceLayers(policy.tools.eslint?.precedence).usesProject },
);
