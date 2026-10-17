import path from 'node:path';
import { execute } from '../execution/python-process.mjs';
import { testCommand, testEnvironment } from '../execution/python-test-runner.mjs';
import { JUNIT_REPORT, RERUN_REPORT } from './junit-results.mjs';
import { slowCandidates } from './slow-tests.mjs';

function selection(context, { testCase }) {
  return context.project.testRunner === 'pytest'
    ? [testCase.id]
    : ['-k', `${testCase.qualifiedClass}.${testCase.functionName}`];
}

export function rerunCommand(context, runs) {
  const timed = testCommand(context).map((argument) =>
    argument.endsWith(JUNIT_REPORT) ? argument.replace(JUNIT_REPORT, RERUN_REPORT) : argument,
  );
  return ['python', ...timed, ...runs.flatMap((run) => selection(context, run))];
}

export function retimeSlowTests(context, outcome) {
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
  } catch {
    return;
  }
}
