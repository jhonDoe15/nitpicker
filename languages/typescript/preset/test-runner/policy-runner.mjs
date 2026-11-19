import { runnerDetection } from './detect-runner.mjs';
import { recordedTestRunner } from './vocabulary/runner-vocabulary.mjs';
import { DEFAULT_TEST_RUNNER } from './runners.mjs';

export function policyTestRunner(policy, projectRoot) {
  return recordedTestRunner(policy) ?? runnerDetection(projectRoot).runner ?? DEFAULT_TEST_RUNNER;
}
