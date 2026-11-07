import { defineConfig } from 'vitest/config';
import { createDurationSequencer } from './scripts/test-shards/sequencer.mjs';
import { TEST_FILES, suiteFiles } from './scripts/test-shards/e2e-gates.mjs';

const jvmEndToEnd =
  process.env.NITPICKER_JAVA_E2E === '1' || process.env.NITPICKER_KOTLIN_E2E === '1';

// With an end-to-end suite flag set, the run selects the files that read that flag, so a new file
// joins its suite without a path list in package.json.
const suite = suiteFiles(import.meta.dirname, process.env);

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
    include: suite.length === 0 ? TEST_FILES : suite,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    globalSetup: ['./scripts/reference/global-setup.mjs'],
    setupFiles: jvmEndToEnd ? ['./scripts/test-shards/repository-timeouts.mjs'] : [],
  },
});
