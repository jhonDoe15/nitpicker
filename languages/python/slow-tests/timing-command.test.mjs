import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RERUN_TIMES_REPORT,
  TEST_TIMES_REPORT,
  testIdentifier,
  timedTestCommand,
} from './timing-command.mjs';

const REPORT_ROOT = path.join(path.sep, 'tmp', 'report');
const TIMES = path.join(REPORT_ROOT, TEST_TIMES_REPORT);
const PYTEST = { reportRoot: REPORT_ROOT, project: { testRunner: 'pytest' } };
const UNITTEST = { reportRoot: REPORT_ROOT, project: { testRunner: 'unittest' } };
const TEST = {
  file: 'tests/test_pay.py',
  className: 'tests.test_pay.TestPay',
  classes: ['TestPay'],
  name: 'test_slow[1-2]',
};

describe('timed test command', () => {
  it('asks pytest for a JUnit file with the time of the call of each test, without its fixtures', () => {
    expect(timedTestCommand(PYTEST, ['-m', 'pytest', '-q', '-n0'])).toEqual([
      '-m',
      'pytest',
      '-q',
      '-n0',
      `--junitxml=${TIMES}`,
      '-o',
      'junit_family=xunit1',
      '-o',
      'junit_duration_report=call',
    ]);
  });

  it('runs unittest through the timing script with the same discovery arguments', () => {
    const [script, ...rest] = timedTestCommand(UNITTEST, [
      '-m',
      'unittest',
      'discover',
      '-s',
      'tests',
      '-t',
      '.',
    ]);
    expect(path.basename(script)).toBe('unittest_timing.py');
    expect(rest).toEqual([TIMES, 'discover', '-s', 'tests', '-t', '.']);
  });

  it('selects tests by pytest node id or by unittest name, into its own report', () => {
    const options = { report: RERUN_TIMES_REPORT, tests: [TEST] };
    expect(timedTestCommand(PYTEST, ['-m', 'pytest'], options)).toEqual([
      '-m',
      'pytest',
      'tests/test_pay.py::TestPay::test_slow[1-2]',
      `--junitxml=${path.join(REPORT_ROOT, RERUN_TIMES_REPORT)}`,
      '-o',
      'junit_family=xunit1',
      '-o',
      'junit_duration_report=call',
    ]);
    expect(timedTestCommand(UNITTEST, ['-m', 'unittest', 'discover'], options).slice(2)).toEqual([
      'discover',
      '-k',
      'tests.test_pay.TestPay.test_slow[1-2]',
    ]);
  });

  it('names a test without a class by its file and function', () => {
    expect(testIdentifier(PYTEST, { ...TEST, classes: [], name: 'test_a' })).toBe(
      'tests/test_pay.py::test_a',
    );
  });
});
