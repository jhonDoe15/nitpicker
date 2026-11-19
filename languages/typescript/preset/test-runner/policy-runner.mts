import { runnerDetection } from './detect-runner.mts';
import { recordedTestRunner } from './vocabulary/runner-vocabulary.mts';
import { DEFAULT_TEST_RUNNER } from './runners.mts';

export function policyTestRunner(policy: unknown, projectRoot: string): string {
  return recordedTestRunner(policy) ?? runnerDetection(projectRoot).runner ?? DEFAULT_TEST_RUNNER;
}
