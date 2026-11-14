import { describe, expect, it } from 'vitest';

import { describeProcessEnd, failureDetail } from './process-failure.mjs';

const WARNING =
  '(node:7806) ESLintIgnoreWarning: The ".eslintignore" file is no longer supported.\n' +
  '(Use `node --trace-warnings ...` to show where the warning was created)\n';

describe('describeProcessEnd', () => {
  it('names the signal and the memory remedy for a kill, not the startup warning', () => {
    const message = describeProcessEnd('ESLint', {
      status: null,
      signal: 'SIGKILL',
      stderr: WARNING,
      stdout: '',
    });
    expect(message).toBe(
      'ESLint was killed by SIGKILL (usually the out-of-memory killer; run fewer jobs at once ' +
        'with NITPICKER_MAX_PARALLEL or give the job more memory)',
    );
  });

  it('keeps a real error that follows warnings', () => {
    const message = describeProcessEnd('jscpd', {
      status: null,
      signal: 'SIGKILL',
      stderr: `${WARNING}FATAL ERROR: heap out of memory\n`,
      stdout: '',
    });
    expect(message).toBe(
      'jscpd was killed by SIGKILL (usually the out-of-memory killer; run fewer jobs at once ' +
        'with NITPICKER_MAX_PARALLEL or give the job more memory): FATAL ERROR: heap out of memory',
    );
  });

  it('does not call another signal an out-of-memory kill', () => {
    const message = describeProcessEnd('tsc', {
      status: null,
      signal: 'SIGTERM',
      stderr: '',
      stdout: '',
    });
    expect(message).toBe('tsc was terminated by SIGTERM');
  });

  it('reports an exit status with its stderr and a location', () => {
    expect(
      describeProcessEnd(
        'jscpd',
        { status: 2, signal: null, stderr: 'boom\n', stdout: '' },
        { where: '/p' },
      ),
    ).toBe('jscpd exited with 2 in /p: boom');
  });

  it('says so when a normal exit printed only warnings', () => {
    expect(
      describeProcessEnd('ESLint', { status: 2, signal: null, stderr: WARNING, stdout: '' }),
    ).toBe('ESLint exited with 2: no diagnostic output');
  });
});

describe('what counts as a notice', () => {
  const detail = (stderr) => failureDetail({ stderr, stdout: '' });

  it('keeps a Node warning that carries the error', () => {
    const line = '(node:42) UnhandledPromiseRejectionWarning: Error: ENOENT: no such file';

    expect(detail(`${line}\n`)).toBe(line);
  });

  it('keeps a real error line that merely mentions a deprecation code', () => {
    const line = 'Error: cannot load plugin [DEP0040] missing';

    expect(detail(`${line}\n`)).toBe(line);
  });

  it('drops deprecation and experimental notices with their hint', () => {
    const notices =
      '(node:1) [DEP0040] DeprecationWarning: The `punycode` module is deprecated.\n' +
      '(node:1) ExperimentalWarning: Type stripping is experimental\n' +
      '(Use `node --trace-deprecation ...` to show where the warning was created)\n';

    expect(detail(`${notices}boom\n`)).toBe('boom');
  });
});

describe('failureDetail', () => {
  it('falls back to standard output', () => {
    expect(failureDetail({ stderr: WARNING, stdout: 'out\n' })).toBe('out');
  });
});
