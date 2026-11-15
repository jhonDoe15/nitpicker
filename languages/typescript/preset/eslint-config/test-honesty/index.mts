import vitest from '@vitest/eslint-plugin';
import type { Linter } from 'eslint';
import { nitpickerRules } from '../../eslint-plugin/index.mjs';
import { codeExtensions } from '../../layout.mjs';
import { escapeHatchLinterOptions } from '../strict/strict-escape-hatches.mjs';
import { type ScopeLayout, linterConfigs } from '../typed/config-types.mts';
import { testAreaGlobsFor } from '../typed/glob-views.mts';
import { restrictedMatchers } from './restricted-matchers.mts';

type TestLayout = ScopeLayout & {
  readonly unitTestGlobs: string[];
  readonly colocatedTests: boolean;
};
type Restores = { readonly scope: string; readonly globals: boolean; readonly envs: boolean };
type StubOptions = {
  readonly setupFiles?: string[];
  readonly stubRestores?: readonly Restores[];
  readonly testRootsOnDisk?: string[];
  readonly assertionFunctionNames?: string[];
};

function unitTestGlobsFor(layout: TestLayout): string[] {
  return [
    ...layout.unitTestGlobs,
    ...layout.testGlobs.filter((glob) => glob.includes('.{test,spec}.')),
  ];
}

function runnableTestGlobs(roots: readonly string[]): string[] {
  return roots.map((root) => `${root}/**/*.{test,spec}.${codeExtensions}`);
}

function stubRestoreBlock(
  restores: Restores,
  { projectGlobs, ignores }: { projectGlobs: string[]; ignores: string[] },
) {
  return {
    files: restores.scope === '.' ? projectGlobs : runnableTestGlobs([restores.scope]),
    ignores,
    plugins: { nitpicker: nitpickerRules },
    rules: {
      'nitpicker/fake-timers-require-restore': [
        'error',
        { globals: !restores.globals, envs: !restores.envs },
      ],
    },
  };
}

function stubRestoreConfigFor(
  layout: TestLayout,
  { setupFiles, stubRestores }: { setupFiles: string[]; stubRestores: readonly Restores[] },
) {
  const context = {
    ignores: [...layout.excludedGlobs, ...setupFiles],
    projectGlobs: runnableTestGlobs([...layout.testRoots, ...layout.sourceRoots]),
  };
  return [{ scope: '.', globals: false, envs: false }, ...stubRestores].map((restores) =>
    stubRestoreBlock(restores, context),
  );
}

function testPlacementBlock(
  layout: TestLayout,
  { testAreaGlobs, testRootsOnDisk }: { testAreaGlobs: string[]; testRootsOnDisk: string[] },
) {
  const options = layout.colocatedTests
    ? { colocated: true }
    : { testRoot: testRootsOnDisk[0] ?? layout.testRoots[0] };
  return {
    files: layout.sourceGlobs,
    ignores: [...layout.excludedGlobs, ...testAreaGlobs],
    plugins: { nitpicker: nitpickerRules },
    rules: { 'nitpicker/no-test-helpers-in-source': ['error', options] },
  };
}

function honestyRulesBlock(
  layout: TestLayout,
  { files, assertionFunctionNames }: { files: string[]; assertionFunctionNames: string[] },
) {
  return {
    files,
    ignores: layout.excludedGlobs,
    linterOptions: escapeHatchLinterOptions,
    plugins: { nitpicker: nitpickerRules, vitest },
    rules: {
      'nitpicker/no-comments': ['error', { suppressionsOnly: true }],
      'nitpicker/no-shared-test-state': 'error',
      'nitpicker/no-copy-pasted-tests': 'error',
      'nitpicker/fake-timers-require-restore': 'error',
      'nitpicker/no-real-time-random-or-network': 'error',
      'nitpicker/no-switched-off-tests': 'error',
      'nitpicker/no-float-equality-in-tests': 'error',
      'nitpicker/no-assertion-in-loop': ['error', { assertionFunctionNames }],
      'nitpicker/no-unowned-async-assertion': 'error',
      'nitpicker/no-weak-assertion': 'error',
      'vitest/no-restricted-matchers': ['error', restrictedMatchers],
      'vitest/prefer-called-with': 'error',
      'vitest/require-to-throw-message': 'error',
    },
  };
}

export function testHonestyConfigFor(
  layout: TestLayout,
  {
    setupFiles = [],
    stubRestores = [],
    testRootsOnDisk = layout.testRoots,
    assertionFunctionNames = [],
  }: StubOptions = {},
): Linter.Config[] {
  const files = testAreaGlobsFor(layout);
  return linterConfigs([
    honestyRulesBlock(layout, { files, assertionFunctionNames }),
    {
      files: unitTestGlobsFor(layout),
      ignores: layout.excludedGlobs,
      plugins: { nitpicker: nitpickerRules },
      rules: { 'nitpicker/no-real-time-random-or-network': ['error', { network: true }] },
    },
    testPlacementBlock(layout, { testAreaGlobs: files, testRootsOnDisk }),
    ...stubRestoreConfigFor(layout, { setupFiles, stubRestores }),
    {
      files,
      ignores: [...layout.excludedGlobs, `**/*.{test,spec,test-d,spec-d}.${codeExtensions}`],
      plugins: { nitpicker: nitpickerRules },
      rules: { 'nitpicker/no-uncollected-tests': 'error' },
    },
    ...(setupFiles.length === 0
      ? []
      : [
          {
            files: setupFiles,
            plugins: { nitpicker: nitpickerRules },
            rules: { 'nitpicker/no-production-imports-in-setup-files': 'error' },
          },
        ]),
  ]);
}
