import vitest from '@vitest/eslint-plugin';
import type { ESLint, Linter } from 'eslint';
import jest from 'eslint-plugin-jest';
import { nitpickerRules } from '../../eslint-plugin/index.mjs';
import { codeExtensions } from '../../layout.mjs';
import { escapeHatchLinterOptions } from '../strict/strict-escape-hatches.mjs';
import { type ScopeLayout, linterConfigs } from '../typed/config-types.mts';
import { testAreaGlobsFor } from '../typed/glob-views.mts';
import { restrictedMatchers } from './restricted-matchers.mts';

type TestLayout = ScopeLayout & {
  readonly unitTestGlobs: string[];
  readonly colocatedTests: boolean;
  readonly runnerSourceTestGlobs?: readonly string[];
};
type Restores = { readonly scope: string; readonly globals: boolean; readonly envs: boolean };
type StubOptions = {
  readonly runner?: string;
  readonly setupFiles?: string[];
  readonly stubRestores?: readonly Restores[];
  readonly testRootsOnDisk?: string[];
  readonly assertionFunctionNames?: string[];
};

const ERROR = 'error';

const MATCHER_PLUGINS: Readonly<Record<string, Readonly<Record<string, ESLint.Plugin>>>> = {
  vitest: { vitest },
  jest: { jest },
};

function matcherRules(runner: string): Linter.RulesRecord {
  if (MATCHER_PLUGINS[runner] === undefined) {
    return {};
  }
  return {
    [`${runner}/no-restricted-matchers`]: [ERROR, restrictedMatchers],
    [`${runner}/prefer-called-with`]: ERROR,
    [`${runner}/require-to-throw-message`]: ERROR,
  };
}

function unitTestGlobsFor(layout: TestLayout): string[] {
  return [
    ...layout.unitTestGlobs,
    ...layout.testGlobs.filter((glob) => glob.includes('.{test,spec}.')),
    ...(layout.runnerSourceTestGlobs ?? []),
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
        ERROR,
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
    rules: { 'nitpicker/no-test-helpers-in-source': [ERROR, options] },
  };
}

function honestyRulesBlock(
  layout: TestLayout,
  {
    files,
    runner,
    assertionFunctionNames,
  }: { files: string[]; runner: string; assertionFunctionNames: string[] },
) {
  const runnerOption = { runner };
  return {
    files,
    ignores: layout.excludedGlobs,
    linterOptions: escapeHatchLinterOptions,
    plugins: { nitpicker: nitpickerRules, ...MATCHER_PLUGINS[runner] },
    rules: {
      'nitpicker/no-comments': [ERROR, { suppressionsOnly: true }],
      'nitpicker/no-shared-test-state': ERROR,
      'nitpicker/no-copy-pasted-tests': [ERROR, runnerOption],
      'nitpicker/fake-timers-require-restore': ERROR,
      'nitpicker/no-real-time-random-or-network': [ERROR, runnerOption],
      'nitpicker/no-switched-off-tests': ERROR,
      'nitpicker/no-unpinned-assertion': ERROR,
      'nitpicker/no-float-equality-in-tests': ERROR,
      'nitpicker/no-assertion-in-loop': [ERROR, { assertionFunctionNames }],
      'nitpicker/no-unowned-async-assertion': ERROR,
      'nitpicker/no-weak-assertion': ERROR,
      ...matcherRules(runner),
    },
  };
}

function setupFileBlocks(setupFiles: string[]) {
  if (setupFiles.length === 0) {
    return [];
  }
  return [
    {
      files: setupFiles,
      plugins: { nitpicker: nitpickerRules },
      rules: { 'nitpicker/no-production-imports-in-setup-files': ERROR },
    },
  ];
}

export function testHonestyConfigFor(
  layout: TestLayout,
  {
    runner = 'vitest',
    setupFiles = [],
    stubRestores = [],
    testRootsOnDisk = layout.testRoots,
    assertionFunctionNames = [],
  }: StubOptions = {},
): Linter.Config[] {
  const files = testAreaGlobsFor(layout);
  const runnerOption = { runner };
  return linterConfigs([
    honestyRulesBlock(layout, { files, runner, assertionFunctionNames }),
    {
      files: unitTestGlobsFor(layout),
      ignores: layout.excludedGlobs,
      plugins: { nitpicker: nitpickerRules },
      rules: {
        'nitpicker/no-real-time-random-or-network': [ERROR, { network: true, ...runnerOption }],
      },
    },
    testPlacementBlock(layout, { testAreaGlobs: files, testRootsOnDisk }),
    ...stubRestoreConfigFor(layout, { setupFiles, stubRestores }),
    {
      files,
      ignores: layout.excludedGlobs,
      plugins: { nitpicker: nitpickerRules },
      rules: { 'nitpicker/no-uncollected-tests': [ERROR, runnerOption] },
    },
    ...setupFileBlocks(setupFiles),
  ]);
}
