import { readHeadPolicy } from '../../../../head-policy.mjs';
import { DEFAULT_TEST_RUNNER, TEST_RUNNERS } from '../../../../test-runner/runners.mjs';
import {
  recordedTestRunner,
  runnerVocabulary,
} from '../../../../test-runner/runner-vocabulary.mjs';

export const RUNNER_OPTION_PROPERTY = { runner: { enum: TEST_RUNNERS } };

export const RUNNER_OPTION_SCHEMA = [
  { type: 'object', properties: RUNNER_OPTION_PROPERTY, additionalProperties: false },
];

export function runnerOf(context) {
  return context.options[0]?.runner ?? recordedTestRunner(readHeadPolicy()) ?? DEFAULT_TEST_RUNNER;
}

export function vocabularyOf(context) {
  return runnerVocabulary(runnerOf(context));
}
