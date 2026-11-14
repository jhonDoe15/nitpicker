import { gradleTarget } from '../gradle-wrapper/gradle-command.mjs';
import { gradleOptions } from '../gradle-wrapper/gradle-stages.mjs';
import { runGradle } from '../gradle-wrapper/gradle-process.mjs';
import { gradleLog, withGradleLog } from '../gradle-wrapper/diagnostics/failure-log.mjs';
import { condenseFailure } from '../gradle-wrapper/diagnostics/failure-text.mjs';
import { gradleSpawnFailure } from '../gradle-wrapper/diagnostics/spawn-failure.mjs';
import { failingTestsOf } from '../gradle-reports/failing-tests.mjs';
import { failingTestsError } from '../../builds/test-failures.mjs';
import { presetLabel, withCompileErrors } from '../../builds/compile-errors/compile-findings.mjs';
import { MINUTE_MS } from '../../../../shared/analyzer-timeouts/analyzer-timeouts.mjs';

function failedStage(result, projectRoot, { policy, command, budget }) {
  if (result.error !== undefined) {
    return gradleSpawnFailure(result.error, { command, budget, projectRoot });
  }
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const detail = condenseFailure(output, projectRoot) || 'no diagnostic output';
  const where = policy.snapshot === 'base' ? 'on the base' : 'on your change';
  return new Error(`${presetLabel(policy.preset)} preset failed ${where}: ${detail}`);
}

export function assertGradleSucceeded(
  result,
  projectRoot,
  { reportBase, since, checkTests = true, policy = {}, command, budget },
) {
  const succeeded = result.error === undefined && result.status === 0;
  const failures =
    result.error === undefined && (!succeeded || checkTests)
      ? failingTestsOf({ reportBase, since })
      : [];
  const log = gradleLog(policy);
  if (failures.length > 0) {
    const error = withGradleLog(failingTestsError(failures), result, log);
    throw error.failures === undefined
      ? Object.defineProperty(error, 'failures', { value: failures })
      : error;
  }
  if (succeeded) {
    return;
  }
  const stage = failedStage(result, projectRoot, { policy, command, budget });
  const error = withGradleLog(stage, result, log);
  if (result.error?.code === 'ETIMEDOUT') {
    const minutes = budget.commandTimeoutMs / MINUTE_MS;
    throw Object.defineProperty(error, 'timedOut', { value: { build: 'Gradle', minutes } });
  }
  throw result.error === undefined
    ? withCompileErrors(error, `${result.stdout ?? ''}\n${result.stderr ?? ''}`, projectRoot)
    : error;
}

export function runGradleStage({
  args,
  projectRoot,
  gradle,
  budget,
  reportBase,
  since,
  checkTests,
  policy,
  spawn,
}) {
  const target = gradleTarget({ projectRoot, configured: gradle, args });
  const result = runGradle(
    target.command,
    target.args,
    gradleOptions(target, { projectRoot, budget, spawn }),
  );
  assertGradleSucceeded(result, projectRoot, {
    reportBase,
    since,
    checkTests,
    policy,
    command: target.command,
    budget,
  });
}
