import { defineConfig } from 'vitest/config';
import { createDurationSequencer } from './scripts/test-shards/sequencer.mjs';

export default defineConfig({
  test: {
    environment: 'node',
    sequence: { sequencer: createDurationSequencer },
    // Tests start their own vitest runs (eval acceptance tests, Stryker mutants). Clearing the step
    // summary path keeps those nested runs, some of which fail on purpose, out of the CI job's
    // "Vitest Test Report"; the suite's own report is written by this process, which keeps it.
    env: {
      NITPICKER_MAX_PARALLEL: '1',
      GITHUB_STEP_SUMMARY: '',
      NITPICKER_SHARED_BUILD_DIRECTORY: '',
    },
    include: ['{core,shared,languages,scripts}/**/*.test.mjs', 'evals/**/*.test.mjs'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles:
      process.env.NITPICKER_JAVA_E2E === '1' || process.env.NITPICKER_KOTLIN_E2E === '1'
        ? ['./scripts/test-shards/repository-timeouts.mjs']
        : [],
  },
});
