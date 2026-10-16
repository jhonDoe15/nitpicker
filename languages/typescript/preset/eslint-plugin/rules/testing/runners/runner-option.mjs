import { TEST_RUNNERS } from '../../../../test-runner/runners.mjs';
import { runnerVocabulary } from '../../../../test-runner/runner-vocabulary.mjs';

export const RUNNER_OPTION_PROPERTY = { runner: { enum: TEST_RUNNERS } };

export const RUNNER_OPTION_SCHEMA = [
  { type: 'object', properties: RUNNER_OPTION_PROPERTY, additionalProperties: false },
];

export function vocabularyOf(context) {
  return runnerVocabulary(context.options[0]?.runner);
}
