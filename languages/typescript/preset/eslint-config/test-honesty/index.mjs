import vitest from '@vitest/eslint-plugin';
import { nitpickerRules } from '../../eslint-plugin/index.mjs';
import { codeExtensions } from '../../layout.mjs';
import { escapeHatchLinterOptions } from '../strict/strict-escape-hatches.mjs';
import { testAreaGlobsFor } from '../strict-tests.mjs';
import { restrictedMatchers } from './restricted-matchers.mjs';

function unitTestGlobsFor(layout) {
  return [
    ...layout.unitTestGlobs,
    ...layout.testGlobs.filter((glob) => glob.includes('.{test,spec}.')),
  ];
}

function runnableTestGlobs(roots) {
  return roots.map((root) => `${root}/**/*.{test,spec}.${codeExtensions}`);
}

function stubRestoreBlock(restores, { projectGlobs, ignores }) {
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

function stubRestoreConfigFor(layout, { setupFiles, stubRestores }) {
  const context = {
    ignores: [...layout.excludedGlobs, ...setupFiles],
    projectGlobs: runnableTestGlobs([...layout.testRoots, ...layout.sourceRoots]),
  };
  return [{ scope: '.', globals: false, envs: false }, ...stubRestores].map((restores) =>
    stubRestoreBlock(restores, context),
  );
}

function testPlacementBlock(layout, { testAreaGlobs, testRootsOnDisk }) {
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

export function testHonestyConfigFor(
  layout,
  { setupFiles = [], stubRestores = [], testRootsOnDisk = layout.testRoots } = {},
) {
  const files = testAreaGlobsFor(layout);
  return [
    {
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
        'nitpicker/no-unowned-async-assertion': 'error',
        'vitest/no-restricted-matchers': ['error', restrictedMatchers],
        'vitest/prefer-called-with': 'error',
        'vitest/require-to-throw-message': 'error',
      },
    },
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
  ];
}
