export const TEST_RESULTS = 'reports/test-results';

const RECORDED_RESULTS = [
  '--coverage',
  '--coverage.reporter=json',
  `--coverage.reportsDirectory=${TEST_RESULTS}`,
  '--reporter=default',
  '--reporter=json',
  `--outputFile.json=${TEST_RESULTS}/test-report.json`,
];

export type CheckStep = {
  readonly name: string;
  readonly args: readonly string[];
  readonly environment: NodeJS.ProcessEnv;
};

export function checkSteps(
  testArguments: readonly string[],
  environment: NodeJS.ProcessEnv,
): CheckStep[] {
  const whole = testArguments.length === 0;
  return [
    {
      name: 'tests',
      args: [
        'node_modules/vitest/vitest.mjs',
        'run',
        '--config',
        'vitest.config.mts',
        ...(whole ? RECORDED_RESULTS : testArguments),
      ],
      environment,
    },
    {
      name: 'self-gate',
      args: ['core/cli.mts', ...(whole ? [] : ['--quick'])],
      environment: whole ? { ...environment, NITPICKER_TEST_RESULTS: TEST_RESULTS } : environment,
    },
  ];
}
