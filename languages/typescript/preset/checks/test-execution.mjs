import { MINUTE_MS, vitestVersion, crapVersion, strykerVersion } from './constants.mjs';
import { JAVASCRIPT_PRESET_FILE, CRAP_CONFIGURATION_FILES } from './policy-files.mjs';
import { DEFAULT_CRAP_SCORE_LIMIT } from '../../../../shared/policy.mjs';
import { testConsoleCheckFor } from './test-console.mjs';

const COVERAGE_CONFIGURATION_FILES = [
  'languages/typescript/preset/defaults/vitest.quality.config.ts',
  'languages/typescript/preset/layout.mjs',
  'languages/typescript/preset/head-policy.mjs',
  'languages/typescript/preset/test-console/ansi.mjs',
  'languages/typescript/preset/test-console/vitest-reporter.config.mjs',
  JAVASCRIPT_PRESET_FILE,
];

export function testExecutionChecksFor(exclusions) {
  return [
    {
      name: 'coverage',
      kind: 'coverage',
      version: vitestVersion,
      exclusions: exclusions.general,
      concurrencyWeight: 2,
      concurrencyGroup: 'test-execution',
      executionPriority: 1,
      reportedTools: ['test-runtime'],
      shardWeight: 16,
      timeoutMs: 5 * MINUTE_MS,
      configurationFiles: COVERAGE_CONFIGURATION_FILES,
    },
    testConsoleCheckFor(exclusions),
    {
      name: 'crap',
      kind: 'crap',
      version: crapVersion,
      exclusions: exclusions.production,
      dependencies: ['coverage'],
      shardWeight: 2,
      timeoutMs: 2 * MINUTE_MS,
      adapterArguments: ['--crap-score-limit', String(DEFAULT_CRAP_SCORE_LIMIT)],
      configurationFiles: CRAP_CONFIGURATION_FILES,
    },
    {
      name: 'mutation',
      kind: 'mutation',
      version: strykerVersion,
      exclusions: exclusions.production,
      concurrencyWeight: 2,
      concurrencyGroup: 'test-execution',
      executionPriority: 1,
      shardWeight: 90,
      timeoutMs: 30 * MINUTE_MS,
      configurationFiles: [
        'languages/typescript/preset/tool-configs.mjs',
        'languages/typescript/preset/modules/selected-project-tsconfig.mjs',
        JAVASCRIPT_PRESET_FILE,
        'languages/typescript/preset/defaults/stryker.config.mjs',
        'languages/typescript/preset/defaults/vitest.quality.config.ts',
        'languages/typescript/preset/defaults/tsconfig.stryker.json',
      ],
    },
  ];
}
