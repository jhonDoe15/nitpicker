import { defineConfig } from 'vitest/config';
import { createDurationSequencer } from './scripts/test-shards/sequencer.mjs';

const jvmEndToEnd =
  process.env.NITPICKER_JAVA_E2E === '1' || process.env.NITPICKER_KOTLIN_E2E === '1';

const mavenCentralRetries = [
  '-Daether.connector.http.retryHandler.count=6',
  '-Daether.connector.http.retryHandler.interval=10000',
  '-Daether.connector.http.retryHandler.serviceUnavailable=429,503',
];

export default defineConfig({
  test: {
    environment: 'node',
    sequence: { sequencer: createDurationSequencer },
    // Tests start their own vitest runs (eval acceptance tests, Stryker mutants). Clearing the step
    // summary path keeps those nested runs, some of which fail on purpose, out of the CI job's
    // "Vitest Test Report"; the suite's own report is written by this process, which keeps it. The
    // same goes for nitpicker's own job summary and annotations, which tests would otherwise write
    // into the CI job and into the output they compare.
    env: {
      NITPICKER_MAX_PARALLEL: '1',
      GITHUB_STEP_SUMMARY: '',
      NITPICKER_GITHUB_OUTPUT: 'off',
      NITPICKER_SHARED_BUILD_DIRECTORY: '',
      ...(jvmEndToEnd
        ? { MAVEN_OPTS: [process.env.MAVEN_OPTS, ...mavenCentralRetries].filter(Boolean).join(' ') }
        : {}),
    },
    include: ['{core,shared,languages,scripts}/**/*.test.mjs', 'evals/**/*.test.mjs'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: jvmEndToEnd ? ['./scripts/test-shards/repository-timeouts.mjs'] : [],
  },
});
