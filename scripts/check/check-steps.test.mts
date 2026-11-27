import { describe, expect, it } from 'vitest';
import { TEST_RESULTS, checkSteps } from './check-steps.mts';

const VITEST = ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.mts'];

describe('the steps of npm run check', () => {
  it('records the results of the whole suite and hands them to the gate', () => {
    const environment = { PATH: '/bin' };

    expect(checkSteps([], environment)).toEqual([
      {
        name: 'tests',
        args: [
          ...VITEST,
          '--coverage',
          '--coverage.reporter=json',
          `--coverage.reportsDirectory=${TEST_RESULTS}`,
          '--reporter=default',
          '--reporter=json',
          `--outputFile.json=${TEST_RESULTS}/test-report.json`,
        ],
        environment,
      },
      {
        name: 'self-gate',
        args: ['core/cli.mts'],
        environment: { PATH: '/bin', NITPICKER_TEST_RESULTS: TEST_RESULTS },
      },
    ]);
  });

  it('runs only the named tests and a quick gate that runs its own', () => {
    const environment = { PATH: '/bin' };

    expect(checkSteps(['core/a.test.mts'], environment)).toEqual([
      { name: 'tests', args: [...VITEST, 'core/a.test.mts'], environment },
      { name: 'self-gate', args: ['core/cli.mts', '--quick'], environment },
    ]);
  });
});
