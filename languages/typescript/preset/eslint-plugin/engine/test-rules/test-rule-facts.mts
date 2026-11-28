import { vocabularyOf } from '../../rules/runner-apis/runner-option.mts';
import { readLayout } from '../../rules/typed/policy-views.mts';
import { isProductionModule } from '../../rules/test-runtime/assertions/no-mocking-subject-under-test.mts';
import { isCollected } from '../../test-isolation/no-uncollected-tests.mts';
import { productionModulePath } from '../../test-isolation/production-source.mts';
import type { RunnerVocabulary } from '../../../test-runner/vocabulary/typed-vocabulary.mts';
import type { EngineRule, FileFacts } from '../engine-rules.mts';

const layout = readLayout();

export function kebab(word: string): string {
  return word.replaceAll(/[A-Z]/gu, (upper) => `-${upper.toLowerCase()}`);
}

export function runnerWords(...words: readonly (keyof RunnerVocabulary)[]): FileFacts {
  return (_filename, options) => {
    const vocabulary = vocabularyOf({ options });
    return Object.fromEntries(words.map((word) => [kebab(word), vocabulary[word]]));
  };
}

function optionJson(options: readonly unknown[], name: string): string {
  return JSON.stringify(Reflect.get(Object(options[0]), name) ?? null);
}

function isIntegrationTest(filename: string): boolean {
  const normalized = filename.replaceAll('\\', '/');
  return layout.testRoots.some((root) => normalized.includes(`/${root}/integration/`));
}

export const TEST_ENGINE_RULES: readonly (readonly [string, EngineRule])[] = [
  [
    'integration-test-uses-approved-harness',
    {
      facts: (filename, options) => ({
        integration: String(isIntegrationTest(filename)),
        'approved-functions': optionJson(options, 'approvedFunctions'),
        'approved-subprocesses': optionJson(options, 'approvedSubprocesses'),
      }),
    },
  ],
  ['no-first-test-charged-setup', { facts: runnerWords('sharedSetupHook') }],
  ['no-fixed-port-in-tests', {}],
  ['no-float-equality-in-tests', {}],
  [
    'no-fixed-sleep-synchronization',
    {
      facts: (filename, options, project) => ({
        ...runnerWords('waitOnCondition', 'advanceFakeTime')(filename, options, project),
        fixture: String(layout.isTestFixture(filename)),
      }),
    },
  ],
  ['no-listing-order-in-assertions', {}],
  [
    'no-mocking-subject-under-test',
    {
      conditions: {
        'production-subject': (value, filename) =>
          isProductionModule(filename.replaceAll('\\', '/'), value),
      },
    },
  ],
  [
    'no-partial-output-assertion',
    {
      facts: runnerWords('wholeOutput', 'fragmentForms', 'wholeValue', 'partialForms', 'variedField'),
    },
  ],
  [
    'no-production-imports-in-setup-files',
    {
      conditions: {
        'production-module': (value, filename) =>
          productionModulePath(value, filename) !== undefined,
      },
    },
  ],
  [
    'no-real-time-random-or-network',
    {
      facts: (filename, options, project) => ({
        ...runnerWords('fakeClock', 'fixRandom')(filename, options, project),
        network: String(Reflect.get(Object(options[0]), 'network') === true),
      }),
    },
  ],
  ['no-shared-temp-path-in-tests', {}],
  ['no-uncleared-shared-mock', {}],
  [
    'no-uncollected-tests',
    {
      facts: (filename, options, project) => ({
        ...runnerWords('collectIt')(filename, options, project),
        collected: String(isCollected({ options, filename, cwd: project.root })),
      }),
    },
  ],
  ['no-uninjectable-delay', {}],
  ['no-unpinned-assertion', {}],
  ['no-wall-clock-bound-in-tests', {}],
  ['no-weak-assertion', {}],
  [
    'no-worker-state-in-concurrent-tests',
    {
      facts: (_filename, options) => ({
        concurrent: String(Reflect.get(Object(options[0]), 'concurrent') === true),
      }),
    },
  ],
];
