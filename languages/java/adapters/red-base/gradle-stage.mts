import { gradleTarget } from '../gradle-wrapper/gradle-command.mjs';
import { gradleOptions } from '../gradle-wrapper/gradle-stages.mts';
import { type GradleResult, runGradle } from '../gradle-wrapper/gradle-process.mts';
import { gradleLog, withGradleLog } from '../gradle-wrapper/diagnostics/failure-log.mts';
import { condenseFailure } from '../gradle-wrapper/diagnostics/failure-text.mts';
import { gradleSpawnFailure } from '../gradle-wrapper/diagnostics/spawn-failure.mts';
import { failingTestsOf } from '../gradle-reports/failing-tests.mts';
import { failingTestsError } from '../../builds/test-failures.mjs';
import { presetLabel, withCompileErrors } from '../../builds/compile-errors/compile-findings.mjs';
import { MINUTE_MS } from '../../../../shared/analyzer-timeouts/analyzer-timeouts.mjs';
import { fieldOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import { type JavaPolicy, callUntyped } from '../typed/java-values.mts';
import type { JavaBudget } from '../typed/java-run-options.mts';

type StageCheck = {
  readonly reportBase: string;
  readonly since: number;
  readonly checkTests: boolean;
  readonly policy?: JavaPolicy;
  readonly command: string;
  readonly budget: JavaBudget;
};
type StageRun = Omit<StageCheck, 'command'> & {
  readonly args: unknown;
  readonly projectRoot: string;
  readonly gradle: string | undefined;
  readonly spawn: unknown;
};
type FailureContext = Pick<StageCheck, 'command' | 'budget'> & { readonly policy: JavaPolicy };

function outputOf(result: GradleResult): string {
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function failedStage(
  result: GradleResult,
  projectRoot: string,
  { policy, command, budget }: FailureContext,
): Error {
  if (result.error !== undefined) {
    return gradleSpawnFailure(result.error, { command, budget, projectRoot });
  }
  const detail = condenseFailure(outputOf(result), projectRoot) || 'no diagnostic output';
  const where = policy.snapshot === 'base' ? 'on the base' : 'on your change';
  return new Error(`${textOf(presetLabel(policy.preset))} preset failed ${where}: ${detail}`);
}

export function assertGradleSucceeded(
  result: GradleResult,
  projectRoot: string,
  { reportBase, since, checkTests, policy = {}, command, budget }: StageCheck,
): void {
  const succeeded = result.error === undefined && result.status === 0;
  const failures =
    result.error === undefined && (!succeeded || checkTests)
      ? failingTestsOf({ reportBase, since })
      : [];
  const log = gradleLog(policy);
  if (failures.length > 0) {
    const error = withGradleLog(failingTestsError(failures), result, log);
    throw fieldOf(error, 'failures') === undefined
      ? Object.defineProperty(error, 'failures', { value: failures })
      : error;
  }
  if (succeeded) {
    return;
  }
  const stage = failedStage(result, projectRoot, { policy, command, budget });
  const error = withGradleLog(stage, result, log);
  if (fieldOf(result.error, 'code') === 'ETIMEDOUT') {
    const minutes = (budget.commandTimeoutMs ?? 0) / MINUTE_MS;
    throw Object.defineProperty(error, 'timedOut', { value: { build: 'Gradle', minutes } });
  }
  throw result.error === undefined
    ? callUntyped(withCompileErrors, error, outputOf(result), projectRoot)
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
}: StageRun): void {
  const target: unknown = gradleTarget({ projectRoot, configured: gradle, args });
  const command = textOf(fieldOf(target, 'command'));
  const result = runGradle(
    command,
    textsOf(fieldOf(target, 'args')),
    gradleOptions(fieldOf(target, 'shell'), { projectRoot, budget, spawn }),
  );
  assertGradleSucceeded(result, projectRoot, {
    reportBase,
    since,
    checkTests,
    ...(policy === undefined ? {} : { policy }),
    command,
    budget,
  });
}
