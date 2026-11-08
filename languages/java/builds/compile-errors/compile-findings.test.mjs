import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compileErrorFindings,
  compileErrorsOf,
  presetLabel,
  withCompileErrors,
} from './compile-findings.mjs';

const ERRORS = [
  { path: 'src/A.java', line: 5, column: 12, message: 'cannot find symbol (method missing())' },
  { path: 'src/A.java', line: 9, message: 'cannot find symbol (method missing())' },
];

describe('compileErrorFindings', () => {
  it('reports each compile error as an enforceable finding and one notice that the build stopped', () => {
    expect(compileErrorFindings(ERRORS, 'java')).toEqual([
      {
        tool: 'build',
        rule: 'compile-error',
        path: 'src/A.java',
        identity: expect.stringMatching(/^compile-error:[0-9a-f]{24}$/u),
        message:
          'cannot find symbol (method missing()). The code does not compile; fix it before anything else is checked.',
        classification: 'enforceable',
        location: { line: 5, column: 12 },
      },
      {
        tool: 'build',
        rule: 'compile-error',
        path: 'src/A.java',
        identity: expect.stringMatching(/^compile-error:[0-9a-f]{24}#2$/u),
        message:
          'cannot find symbol (method missing()). The code does not compile; fix it before anything else is checked.',
        classification: 'enforceable',
        location: { line: 9 },
      },
      {
        tool: 'java',
        rule: 'compile-failed-skipped',
        path: '.',
        identity: 'compile-failed-skipped',
        message:
          'The change does not compile (2 compile errors), so the build stopped and the other Java checks ' +
          'did not run. Fix the build/compile-error findings and rerun.',
        classification: 'tool-error',
      },
    ]);
  });

  it('names the Kotlin preset and one error in the notice', () => {
    expect(compileErrorFindings(ERRORS.slice(0, 1), 'kotlin').at(-1).message).toBe(
      'The change does not compile (1 compile error), so the build stopped and the other Kotlin checks ' +
        'did not run. Fix the build/compile-error findings and rerun.',
    );
    expect(presetLabel()).toBe('Java');
  });
});

describe('the compile errors of a failed build', () => {
  it('travel with the error through the errors that wrap it', () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-compile-findings-')));
    writeFileSync(path.join(root, 'A.java'), '\n');
    const failed = withCompileErrors(
      new Error('Gradle failed'),
      `${root}/A.java:3: error: oops`,
      root,
    );
    rmSync(root, { recursive: true, force: true });
    const wrapped = new Error('wrapped', { cause: new Error('again', { cause: failed }) });

    expect(compileErrorsOf(wrapped)).toEqual([{ path: 'A.java', line: 3, message: 'oops' }]);
    expect(Object.keys(failed)).toEqual([]);
  });

  it('are absent from a failure without compiler errors', () => {
    const failed = new Error('Gradle failed');

    expect(withCompileErrors(failed, 'BUILD FAILED', '/p')).toBe(failed);
    expect(compileErrorsOf(failed)).toEqual([]);
    expect(compileErrorsOf('not an error')).toEqual([]);
  });
});
