import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Tests start their own vitest runs (eval acceptance tests, Stryker mutants). Clearing the step
    // summary path keeps those nested runs, some of which fail on purpose, out of the CI job's
    // "Vitest Test Report"; the suite's own report is written by this process, which keeps it.
    env: {
      NITPICKER_MAX_PARALLEL: '1',
      GITHUB_STEP_SUMMARY: '',
      NITPICKER_SHARED_BUILD_DIRECTORY: '',
    },
    include: ['{core,shared,languages}/**/*.test.mjs', 'evals/**/*.test.mjs'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
