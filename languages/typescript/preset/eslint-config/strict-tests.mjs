import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../eslint-plugin/index.mjs';
import { codeExtensions, defaultResolvedLayout } from '../layout.mjs';
import { promiseChainRule, testControlFlowSelectors } from './strict/strict-control-flow.mjs';
import { typeAssertionSelectors } from './strict/strict-escape-hatches.mjs';

const processTimeoutRules = { 'nitpicker/require-test-process-timeout': 'error' };

export const strictTestRules = {
  'nitpicker/no-git-repository-per-test': 'error',
  'nitpicker/hermetic-git-in-tests': 'error',
  'nitpicker/no-node-process-per-test': 'error',
  'nitpicker/no-server-or-worker-per-test': 'error',
  'nitpicker/no-raised-test-timeout': 'error',
  ...processTimeoutRules,
  'nitpicker/no-first-test-charged-setup': 'error',
  'nitpicker/test-tsconfig-pins-lib-and-types': 'error',
};

const testRestrictedSyntax = [...typeAssertionSelectors, ...testControlFlowSelectors];

export const strictTestHelperRules = {
  'nitpicker/no-process-globals-outside-main-guard': 'error',
};

function testAreaGlobsFor(layout) {
  return [...layout.testGlobs, ...layout.sourceTestDirectoryGlobs];
}

export function strictTestConfigFor(layout = defaultResolvedLayout) {
  return [
    {
      files: testAreaGlobsFor(layout),
      ignores: layout.excludedGlobs,
      plugins: { nitpicker: nitpickerRules },
      rules: {
        ...strictTestRules,
        'no-restricted-syntax': ['error', ...testRestrictedSyntax],
        ...promiseChainRule,
      },
    },
    {
      files: testAreaGlobsFor(layout),
      ignores: [...layout.excludedGlobs, ...layout.runnableTestGlobs],
      plugins: { nitpicker: nitpickerRules },
      rules: strictTestHelperRules,
    },
    {
      files: layout.sourceRoots.map((root) => `${root}/**/test-support/**/*.${codeExtensions}`),
      ignores: layout.excludedGlobs,
      plugins: { nitpicker: nitpickerRules },
      rules: processTimeoutRules,
    },
  ];
}

export const strictTestsConfig = [
  { languageOptions: { parser: tseslint.parser } },
  ...strictTestConfigFor(defaultResolvedLayout),
];
