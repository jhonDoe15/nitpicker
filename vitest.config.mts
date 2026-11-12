import { defineConfig } from 'vitest/config';
import type { TestSequencer, TestSpecification, Vitest } from 'vitest/node';
import {
  createDurationSequencer,
  type DurationSequencer as Sequencer,
} from './scripts/test-shards/sequencer.mts';
import { TEST_FILES, suiteFiles } from './scripts/test-shards/e2e-gates.mts';

const jvmEndToEnd =
  process.env['NITPICKER_JAVA_E2E'] === '1' || process.env['NITPICKER_KOTLIN_E2E'] === '1';

class DurationSequencer implements TestSequencer {
  readonly #sequencer: Sequencer;

  constructor(context: Vitest) {
    this.#sequencer = createDurationSequencer(context);
  }

  shard(specifications: TestSpecification[]): TestSpecification[] {
    return this.#sequencer.shard(specifications);
  }

  sort(specifications: TestSpecification[]): TestSpecification[] {
    return this.#sequencer.sort(specifications);
  }
}

const suite = suiteFiles(import.meta.dirname, process.env);

const mavenCentralRetries = [
  '-Daether.connector.http.retryHandler.count=6',
  '-Daether.connector.http.retryHandler.interval=10000',
  '-Daether.connector.http.retryHandler.serviceUnavailable=429,503',
];

export default defineConfig({
  test: {
    environment: 'node',
    sequence: { sequencer: DurationSequencer },
    env: {
      NITPICKER_MAX_PARALLEL: '1',
      GITHUB_STEP_SUMMARY: '',
      NITPICKER_GITHUB_OUTPUT: 'off',
      NITPICKER_SHARED_BUILD_DIRECTORY: '',
      ...(jvmEndToEnd
        ? {
            MAVEN_OPTS: [process.env['MAVEN_OPTS'], ...mavenCentralRetries]
              .filter(Boolean)
              .join(' '),
          }
        : {}),
    },
    include: suite.length === 0 ? TEST_FILES : suite,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    globalSetup: ['./scripts/reference/global-setup.mts'],
    setupFiles: jvmEndToEnd ? ['./scripts/test-shards/repository-timeouts.mjs'] : [],
  },
});
