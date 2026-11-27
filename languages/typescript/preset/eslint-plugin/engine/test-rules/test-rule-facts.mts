import { vocabularyOf } from '../../rules/runner-apis/runner-option.mts';
import { readLayout } from '../../rules/typed/policy-views.mts';
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
  [
    'no-fixed-sleep-synchronization',
    {
      facts: (filename, options, project) => ({
        ...runnerWords('waitOnCondition', 'advanceFakeTime')(filename, options, project),
        fixture: String(layout.isTestFixture(filename)),
      }),
    },
  ],
  [
    'no-partial-output-assertion',
    {
      facts: runnerWords('wholeOutput', 'fragmentForms', 'wholeValue', 'partialForms', 'variedField'),
    },
  ],
];
