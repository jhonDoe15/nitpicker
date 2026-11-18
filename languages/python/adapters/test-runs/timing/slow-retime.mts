import { execute } from '../../execution/python-process.mts';
import { testCommand, testEnvironment } from '../../execution/python-test-runner.mts';
import { JUNIT_REPORT, RERUN_REPORT } from '../junit-results.mts';
import { slowCandidates } from '../slow-tests.mts';
import type { ToolContext, ToolOutcome } from '../../typed/context/tool-context-types.mts';
import type { JunitTestCase } from '../typed/run-types.mts';

type RerunRun = {
  readonly testCase: Pick<JunitTestCase, 'id' | 'runtimeId' | 'qualifiedClass' | 'functionName'>;
};

function selection(context: ToolContext, { testCase }: RerunRun): string[] {
  return context.project.testRunner === 'pytest'
    ? [testCase.id]
    : ['-k', testCase.runtimeId ?? `${testCase.qualifiedClass}.${testCase.functionName ?? ''}`];
}

export function rerunCommand(context: ToolContext, runs: readonly RerunRun[]): string[] {
  const timed = testCommand(context).map((argument) =>
    argument.endsWith(JUNIT_REPORT) ? argument.replace(JUNIT_REPORT, RERUN_REPORT) : argument,
  );
  return ['python', ...timed, ...runs.flatMap((run) => selection(context, run))];
}

export function retimeSlowTests(context: ToolContext, outcome: ToolOutcome): void {
  if (context.snapshot === 'base' || outcome.testsRan !== true) {
    return;
  }
  try {
    const { runs } = slowCandidates({
      reportRoot: context.reportRoot,
      projectRoot: context.projectRoot,
      limits: context.testSeconds,
      baselineRoot: context.baselineRoot,
    });
    if (runs.length > 0) {
      execute(context, rerunCommand(context, runs), { env: testEnvironment(context) });
    }
  } catch (error) {
    throw new Error('Could not rerun slow tests without coverage', { cause: error });
  }
}
