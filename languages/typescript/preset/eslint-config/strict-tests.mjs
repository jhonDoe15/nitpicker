import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../eslint-plugin/index.mjs';
import { codeExtensions, defaultResolvedLayout, END_TO_END_ROOT } from '../layout.mjs';
import { testControlFlowSelectors } from './strict-control-flow.mjs';
import { typeAssertionSelectors } from './strict-escape-hatches.mjs';

export const strictTestRules = {
  'nitpicker/no-git-repository-per-test': 'error',
  'nitpicker/hermetic-git-in-tests': 'error',
  'nitpicker/no-node-process-per-test': 'error',
  'nitpicker/no-server-or-worker-per-test': 'error',
  'nitpicker/no-raised-test-timeout': 'error',
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

function endToEndConfigFor(layout) {
  return layout.testRoots.includes(END_TO_END_ROOT)
    ? [
        {
          files: [`${END_TO_END_ROOT}/**/*.${codeExtensions}`],
          ignores: layout.excludedGlobs,
          rules: { 'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }] },
        },
      ]
    : [];
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
      },
    },
    {
      files: testAreaGlobsFor(layout),
      ignores: [...layout.excludedGlobs, `**/*.{test,spec}.${codeExtensions}`],
      plugins: { nitpicker: nitpickerRules },
      rules: strictTestHelperRules,
    },
    ...endToEndConfigFor(layout),
  ];
}

export default [
  { languageOptions: { parser: tseslint.parser } },
  ...strictTestConfigFor(defaultResolvedLayout),
];
