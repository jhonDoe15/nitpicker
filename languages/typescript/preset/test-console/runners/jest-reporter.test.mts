import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REPORT_VARIABLE, ROOT_VARIABLE } from '../console-report.mts';
import { fieldOf, listOf, parseJson } from '../../../../../shared/values/readers.mts';
import { createJestReporter } from './jest-reporter.mts';

const ROOT = '/work/app';

describe('the Jest console reporter', () => {
  let directory: string;
  let reportPath: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'jest-reporter-'));
    reportPath = path.join(directory, 'report.json');
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function runWith(
    results: readonly (readonly [
      string,
      readonly { type: string; message: string }[] | undefined,
    ])[],
    environment: NodeJS.ProcessEnv = { [REPORT_VARIABLE]: reportPath, [ROOT_VARIABLE]: ROOT },
  ): void {
    const reporter = createJestReporter({ environment, directory: ROOT });
    for (const [testFilePath, consoleBuffer] of results) {
      reporter.onTestResult({}, { testFilePath, console: consoleBuffer });
    }
    reporter.onRunComplete();
  }

  function entriesWritten(): readonly unknown[] {
    return listOf(fieldOf(parseJson(readFileSync(reportPath, 'utf8')), 'entries'));
  }

  it('keeps error, warn and assert output of each file and drops the rest', () => {
    const file = `${ROOT}/test/a.test.ts`;

    runWith([
      [
        file,
        [
          { type: 'log', message: 'plain' },
          { type: 'warn', message: `Warning: leaked in ${ROOT}/src` },
          { type: 'error', message: 'Error: boom\n    at run (/a/b.js:1:2)' },
          { type: 'assert', message: 'AssertionError [ERR_ASSERTION]: bad' },
        ],
      ],
      [`${ROOT}/test/b.test.ts`, undefined],
    ]);

    expect(entriesWritten()).toEqual([
      { file, test: '', messages: ['Warning: leaked in <root>/src'] },
      { file, test: '', messages: ['Error: boom'] },
      { file, test: '', messages: ['Assertion failed: bad'] },
    ]);
  });

  it('words a failed assert as Node does and reads a grouped call like one outside a group', () => {
    const file = `${ROOT}/test/a.test.ts`;

    runWith([
      [
        file,
        [
          { type: 'assert', message: 'AssertionError [ERR_ASSERTION]: bad input' },
          {
            type: 'assert',
            message: '  AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value',
          },
          { type: 'warn', message: '    at the door' },
        ],
      ],
    ]);

    expect(entriesWritten().map((entry) => fieldOf(entry, 'messages'))).toEqual([
      ['Assertion failed: bad input'],
      ['Assertion failed'],
      ['at the door'],
    ]);
  });

  it('uses the working directory as the project root when none is named', () => {
    runWith([[`${ROOT}/a.test.ts`, [{ type: 'warn', message: `in ${ROOT}/src` }]]], {
      [REPORT_VARIABLE]: reportPath,
    });

    expect(entriesWritten().map((entry) => fieldOf(entry, 'messages'))).toEqual([
      ['in <root>/src'],
    ]);
  });

  it('writes an empty report when no test printed anything', () => {
    runWith([[`${ROOT}/test/a.test.ts`, []]]);

    expect(entriesWritten()).toEqual([]);
  });

  it('writes nothing when the report variable is not set', () => {
    runWith([], { [REPORT_VARIABLE]: '' });

    expect(() => readFileSync(reportPath, 'utf8')).toThrow(/ENOENT/u);
  });
});
