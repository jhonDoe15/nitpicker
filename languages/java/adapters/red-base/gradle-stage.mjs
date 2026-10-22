import { gradleTarget } from '../gradle-wrapper/gradle-command.mjs';
import { runGradle } from '../gradle-wrapper/gradle-process.mjs';
import { withGradleLog } from '../gradle-wrapper/diagnostics/failure-log.mjs';
import { condenseFailure } from '../gradle-wrapper/diagnostics/failure-text.mjs';
import { failingTestsOf } from '../gradle-reports/failing-tests.mjs';
import { gradleFailure } from './tests-failed.mjs';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const MAX_FAILURE_LENGTH = 3500;

export function assertGradleSucceeded(result, projectRoot, { reportBase, since }) {
  if (result.error === undefined && result.status === 0) {
    return;
  }
  const raw = result.stderr?.trim() ? result.stderr : (result.stdout ?? '');
  const detail = condenseFailure(raw, MAX_FAILURE_LENGTH);
  const reported =
    result.error === undefined ? failingTestsOf(projectRoot, { reportBase, since }) : undefined;
  const failure =
    result.error ?? reported ?? gradleFailure(projectRoot, detail || 'no diagnostic output', raw);
  throw Object.assign(withGradleLog(failure, result), {
    testsFailed: reported !== undefined || failure.testsFailed === true,
    detail: failure.detail,
  });
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
