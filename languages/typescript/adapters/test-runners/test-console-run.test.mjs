import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LINES_VARIABLE,
  REPORT_VARIABLE,
  ROOT_VARIABLE,
} from '../../preset/test-console/console-report.mjs';
import { TEST_CONSOLE_REPORT_PATH } from '../quality-areas/reporting/test-report.mjs';
import { consoleProducerPath, startTestConsole } from './test-console-run.mjs';

describe('the console capture of a test run', () => {
  let projectRoot;
  let reportPath;

  beforeEach(() => {
    projectRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'test-console-run-')));
    reportPath = path.join(projectRoot, TEST_CONSOLE_REPORT_PATH);
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('names the report, the project root and the lines file for the test process', () => {
    const capture = startTestConsole({ projectRoot }, { collectsLines: true });

    expect(capture.enabled).toBe(true);
    expect(capture.environment).toEqual({
      [REPORT_VARIABLE]: reportPath,
      [ROOT_VARIABLE]: projectRoot,
      [LINES_VARIABLE]: path.join(projectRoot, '.nitpicker-diff-test-console.jsonl'),
    });
  });

  it('turns the lines of every test process into the normalized report, then removes them', () => {
    const capture = startTestConsole({ projectRoot }, { collectsLines: true });
    const lines = [
      { file: '/p/a.test.js', test: 'one', content: `warn a in ${projectRoot}/src\n` },
      { file: '/p/b.test.js', test: '', content: 'warn b\n    at run (/a/b.js:1:2)' },
      { file: '/p/c.test.js', test: '', content: '{\n}' },
    ];
    for (const line of lines) {
      appendFileSync(capture.environment[LINES_VARIABLE], `${JSON.stringify(line)}\n`);
    }

    capture.finish();
    capture.remove();

    expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toEqual({
      entries: [
        { file: '/p/a.test.js', test: 'one', messages: ['warn a in <root>/src'] },
        { file: '/p/b.test.js', test: '', messages: ['warn b'] },
      ],
    });
    expect(existsSync(capture.environment[LINES_VARIABLE])).toBe(false);
  });

  it('writes an empty report when no test process printed anything', () => {
    const capture = startTestConsole({ projectRoot }, { collectsLines: true });

    capture.finish();

    expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toEqual({ entries: [] });
  });

  it('leaves the report to a reporter that writes it, and clears the one of an earlier run', () => {
    startTestConsole({ projectRoot }, { collectsLines: true }).finish();

    const capture = startTestConsole({ projectRoot }, { collectsLines: false });
    capture.finish();

    expect(capture.environment).not.toHaveProperty(LINES_VARIABLE);
    expect(existsSync(reportPath)).toBe(false);
  });

  it('captures nothing when a few tests are run again to time them', () => {
    startTestConsole({ projectRoot }, { collectsLines: true }).finish();

    const capture = startTestConsole(
      { projectRoot, rerun: { files: [] } },
      { collectsLines: true },
    );
    capture.finish();
    capture.remove();

    expect(capture.enabled).toBe(false);
    expect(capture.environment).toEqual({});
    expect(existsSync(reportPath)).toBe(true);
  });

  it('finds the producers of each runner inside the policy root', () => {
    const options = { policyRoot: '/policy' };

    expect(consoleProducerPath(options, 'jest')).toBe(
      '/policy/languages/typescript/preset/test-console/runners/jest-reporter.config.mjs',
    );
    expect(consoleProducerPath(options, 'mocha')).toBe(
      '/policy/languages/typescript/preset/test-console/runners/mocha-hooks.config.mjs',
    );
  });
});
