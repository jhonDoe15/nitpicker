import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testCommand } from '../adapters/execution/python-test-runner.mjs';

export const TEST_TIMES_REPORT = 'test-times.xml';
export const RERUN_TIMES_REPORT = 'rerun-times.xml';
export const UNITTEST_TIMING_SCRIPT = fileURLToPath(new URL('unittest_timing.py', import.meta.url));
const UNITTEST_MODULE_ARGUMENTS = 2;
const PYTEST_TIMING_OPTIONS = ['-o', 'junit_family=xunit1', '-o', 'junit_duration_report=call'];

export function testIdentifier(context, test) {
  if (context.project.testRunner !== 'pytest') {
    return `${test.className}.${test.name}`;
  }
  return [test.file, ...test.classes, test.name].join('::');
}

function selection(context, tests) {
  const identifiers = tests.map((test) => testIdentifier(context, test));
  return context.project.testRunner === 'pytest'
    ? identifiers
    : identifiers.flatMap((identifier) => ['-k', identifier]);
}

export function timedTestCommand(
  context,
  command,
  { report = TEST_TIMES_REPORT, tests = [] } = {},
) {
  const output = path.join(context.reportRoot, report);
  return context.project.testRunner === 'pytest'
    ? [...command, ...selection(context, tests), `--junitxml=${output}`, ...PYTEST_TIMING_OPTIONS]
    : [
        UNITTEST_TIMING_SCRIPT,
        output,
        ...command.slice(UNITTEST_MODULE_ARGUMENTS),
        ...selection(context, tests),
      ];
}

export function timedCoverageCommand(context, config) {
  const timed = timedTestCommand(context, testCommand(context));
  return ['coverage', 'run', '--rcfile', config, ...timed];
}

export function rerunCommand(context, tests) {
  const timed = timedTestCommand(context, testCommand(context), {
    report: RERUN_TIMES_REPORT,
    tests,
  });
  return ['python', ...timed];
}
