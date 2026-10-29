import { gradleTarget } from '../gradle-wrapper/gradle-command.mjs';
import { gradleOptions } from '../gradle-wrapper/gradle-stages.mjs';
import { runGradle } from '../gradle-wrapper/gradle-process.mjs';
import { withGradleLog } from '../gradle-wrapper/diagnostics/failure-log.mjs';
import { condenseFailure } from '../gradle-wrapper/diagnostics/failure-text.mjs';
import { gradleSpawnFailure } from '../gradle-wrapper/diagnostics/spawn-failure.mjs';
import { failingTestsOf } from '../gradle-reports/failing-tests.mjs';
import { failingTestsError } from '../../builds/test-failures.mjs';

const MAX_FAILURE_LENGTH = 3500;

export function assertGradleSucceeded(result, projectRoot, { reportBase, since, command, budget }) {
  if (result.error === undefined && result.status === 0) {
    return;
  }
  const failures = result.error === undefined ? failingTestsOf({ reportBase, since }) : [];
  if (failures.length > 0) {
    throw Object.defineProperty(
      withGradleLog(failingTestsError(projectRoot, failures), result),
      'failures',
      {
        value: failures,
      },
    );
  }
  const raw = result.stderr?.trim() ? result.stderr : (result.stdout ?? '');
  const detail = condenseFailure(raw, MAX_FAILURE_LENGTH) || 'no diagnostic output';
  throw withGradleLog(
    result.error === undefined
      ? new Error(`Java preset failed in ${projectRoot}: ${detail}`)
      : gradleSpawnFailure(result.error, { command, budget }),
    result,
  );
}

export function runGradleStage({ args, projectRoot, gradle, budget, reportBase, since, spawn }) {
  const target = gradleTarget({ projectRoot, configured: gradle, args });
  const result = runGradle(
    target.command,
    target.args,
    gradleOptions(target, { projectRoot, budget, spawn }),
  );
  assertGradleSucceeded(result, projectRoot, {
    reportBase,
    since,
    command: target.command,
    budget,
  });
}
