import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REPORT_VARIABLE, ROOT_VARIABLE } from '../console-report.mjs';
import { createJestReporter } from './jest-reporter.mjs';

const ROOT = '/work/app';

describe('the Jest console reporter', () => {
  let directory;
  let reportPath;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'jest-reporter-'));
    reportPath = path.join(directory, 'report.json');
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function runWith(
    results,
    environment = { [REPORT_VARIABLE]: reportPath, [ROOT_VARIABLE]: ROOT },
  ) {
    const reporter = createJestReporter({ environment, directory: ROOT });
    for (const [testFilePath, consoleBuffer] of results) {
      reporter.onTestResult({}, { testFilePath, console: consoleBuffer });
    }
    reporter.onRunComplete();
  }

  function entriesWritten() {
    return JSON.parse(readFileSync(reportPath, 'utf8')).entries;
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
      { file, test: '', messages: ['AssertionError [ERR_ASSERTION]: bad'] },
    ]);
  });

  it('uses the working directory as the project root when none is named', () => {
    runWith([[`${ROOT}/a.test.ts`, [{ type: 'warn', message: `in ${ROOT}/src` }]]], {
      [REPORT_VARIABLE]: reportPath,
    });

    expect(entriesWritten().map(({ messages }) => messages)).toEqual([['in <root>/src']]);
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
