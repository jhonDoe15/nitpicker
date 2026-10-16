import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEST_TIMES_REPORT, timedTestCommand } from './timing-command.mjs';

const REPORT_ROOT = path.join(path.sep, 'tmp', 'report');
const TIMES = path.join(REPORT_ROOT, TEST_TIMES_REPORT);

describe('timed test command', () => {
  it('asks pytest for a JUnit file that carries the time of each test', () => {
    const context = { reportRoot: REPORT_ROOT, project: { testRunner: 'pytest' } };
    expect(timedTestCommand(context, ['-m', 'pytest', '-q', '-n0'])).toEqual([
      '-m',
      'pytest',
      '-q',
      '-n0',
      `--junitxml=${TIMES}`,
      '-o',
      'junit_family=xunit1',
    ]);
  });

  it('runs unittest through the timing script with the same discovery arguments', () => {
    const context = { reportRoot: REPORT_ROOT, project: { testRunner: 'unittest' } };
    const [script, ...rest] = timedTestCommand(context, [
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
});
