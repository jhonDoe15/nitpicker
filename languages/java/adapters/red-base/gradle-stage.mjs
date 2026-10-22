import { gradleTarget } from '../gradle-wrapper/gradle-command.mjs';
import { runGradle } from '../gradle-wrapper/gradle-process.mjs';
import { withGradleLog } from '../gradle-wrapper/diagnostics/failure-log.mjs';
import { condenseFailure } from '../gradle-wrapper/diagnostics/failure-text.mjs';
import { failingTestsOf } from '../gradle-reports/failing-tests.mjs';
import { failingTestsError } from '../../builds/test-failures.mjs';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const MAX_FAILURE_LENGTH = 3500;

export function assertGradleSucceeded(result, projectRoot, { reportBase, since }) {
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
    result.error ?? new Error(`Java preset failed in ${projectRoot}: ${detail}`),
    result,
  );
}

export function runGradleStage({ args, projectRoot, gradle, budget, reportBase, since }) {
  const target = gradleTarget({ projectRoot, configured: gradle, args });
  const result = runGradle(target.command, target.args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    shell: target.shell,
    timeout: budget.commandTimeoutMs,
  });
  assertGradleSucceeded(result, projectRoot, { reportBase, since });
}
