import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testCommand } from '../adapters/execution/python-test-runner.mjs';

export const TEST_TIMES_REPORT = 'test-times.xml';
export const UNITTEST_TIMING_SCRIPT = fileURLToPath(new URL('unittest_timing.py', import.meta.url));
const UNITTEST_MODULE_ARGUMENTS = 2;

export function timedTestCommand(context, command) {
  const output = path.join(context.reportRoot, TEST_TIMES_REPORT);
  return context.project.testRunner === 'pytest'
    ? [...command, `--junitxml=${output}`, '-o', 'junit_family=xunit1']
    : [UNITTEST_TIMING_SCRIPT, output, ...command.slice(UNITTEST_MODULE_ARGUMENTS)];
}

export function timedCoverageCommand(context, config) {
  const timed = timedTestCommand(context, testCommand(context));
  return ['coverage', 'run', '--rcfile', config, ...timed];
}
