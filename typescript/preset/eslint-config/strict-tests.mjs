import tseslint from 'typescript-eslint';
import nitpickerRules from '../eslint-plugin/index.mjs';
import { codeExtensions, defaultResolvedLayout } from '../layout.mjs';

// Strict rules for test code: each one bans a form that makes a suite slow or non-hermetic and
// names the one allowed form (see docs/typescript-strict-preset.md, "Inside tests").

/** Rules for every file of the test layout area: test files, helpers and fixtures. */
export const strictTestRules = {
  'nitpicker/no-git-repository-per-test': 'error',
  'nitpicker/hermetic-git-in-tests': 'error',
  'nitpicker/no-node-process-per-test': 'error',
  'nitpicker/no-server-or-worker-per-test': 'error',
  'nitpicker/no-raised-test-timeout': 'error',
  'nitpicker/test-tsconfig-pins-lib-and-types': 'error',
};

/** Rules for the test area's helper and fixture scripts, which are not test files themselves. */
export const strictTestHelperRules = {
  'nitpicker/no-process-globals-outside-main-guard': 'error',
};

function testAreaGlobsFor(layout) {
  return [...layout.testGlobs, ...layout.sourceTestDirectoryGlobs];
}

/** The strict test-area entries for one layout; strictPresetConfig() includes them. */
export function strictTestConfigFor(layout = defaultResolvedLayout) {
  return [
    {
      files: testAreaGlobsFor(layout),
      ignores: layout.excludedGlobs,
      plugins: { nitpicker: nitpickerRules },
      rules: strictTestRules,
    },
    {
      files: testAreaGlobsFor(layout),
      ignores: [...layout.excludedGlobs, `**/*.{test,spec}.${codeExtensions}`],
      plugins: { nitpicker: nitpickerRules },
      rules: strictTestHelperRules,
    },
  ];
}

// Standalone config so the failure-message harness can lint the test rules on their own.
export default [
  { languageOptions: { parser: tseslint.parser } },
  ...strictTestConfigFor(defaultResolvedLayout),
];
