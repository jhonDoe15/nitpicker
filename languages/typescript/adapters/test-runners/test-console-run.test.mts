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
  RUNNER_VARIABLE,
} from '../../preset/test-console/console-report.mts';
import { TEST_CONSOLE_REPORT_PATH } from '../quality-areas/reporting/test-report.mts';
import { consoleProducerPath, startTestConsole } from './test-console-run.mts';
import { testOptions } from './typed/test-options.mts';
import type { Environment } from './typed/runner-types.mts';
import { parseJson } from '../../../../shared/values/readers.mts';

function linesFileOf(environment: Environment): string {
  return environment[LINES_VARIABLE] ?? '';
}

describe('the console capture of a test run', () => {
  let projectRoot: string;
  let reportPath: string;

  beforeEach(() => {
    projectRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'test-console-run-')));
    reportPath = path.join(projectRoot, TEST_CONSOLE_REPORT_PATH);
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('names the report, the project root and the lines file for the test process', () => {
    const capture = startTestConsole(testOptions({ projectRoot }), { collectsLines: true });

    expect(capture.enabled).toBe(true);
    expect(capture.environment).toEqual({
      [REPORT_VARIABLE]: reportPath,
      [ROOT_VARIABLE]: projectRoot,
      [LINES_VARIABLE]: path.join(projectRoot, '.nitpicker-diff-test-console.jsonl'),
      [RUNNER_VARIABLE]: '',
    });
  });

  it('turns the readable lines of every test process into the normalized report, then removes them', () => {
    const capture = startTestConsole(testOptions({ projectRoot }), { collectsLines: true });
    const lines = [
      { file: '/p/a.test.js', test: 'one', content: `warn a in ${projectRoot}/src\n` },
      { file: '/p/b.test.js', test: '', content: 'warn b\n    at run (/a/b.js:1:2)' },
      { file: '/p/c.test.js', test: '', content: '{\n}' },
    ];
    for (const line of lines) {
      appendFileSync(linesFileOf(capture.environment), `${JSON.stringify(line)}\n`);
    }
    appendFileSync(linesFileOf(capture.environment), '{"file":"/p/d.test.js","te\n[1]\n');

    capture.finish();
    capture.remove();

    expect(parseJson(readFileSync(reportPath, 'utf8'))).toEqual({
      entries: [
        { file: '/p/a.test.js', test: 'one', messages: ['warn a in <root>/src'] },
        { file: '/p/b.test.js', test: '', messages: ['warn b'] },
      ],
    });
    expect(existsSync(linesFileOf(capture.environment))).toBe(false);
  });

  it('writes an empty report when no test process printed anything', () => {
    const capture = startTestConsole(testOptions({ projectRoot }), { collectsLines: true });

    capture.finish();

    expect(parseJson(readFileSync(reportPath, 'utf8'))).toEqual({ entries: [] });
  });

  it('leaves the report to a reporter that writes it, and clears the one of an earlier run', () => {
    startTestConsole(testOptions({ projectRoot }), { collectsLines: true }).finish();

    const capture = startTestConsole(testOptions({ projectRoot }), { collectsLines: false });
    capture.finish();

    expect(capture.environment).not.toHaveProperty(LINES_VARIABLE);
    expect(existsSync(reportPath)).toBe(false);
  });

  it('captures nothing when a few tests are run again to time them', () => {
    startTestConsole(testOptions({ projectRoot }), { collectsLines: true }).finish();

    const capture = startTestConsole(
      testOptions({ projectRoot, rerun: { files: [], namePattern: '', withoutMockPin: false } }),
      { collectsLines: true },
    );
    capture.finish();
    capture.remove();

    expect(capture.enabled).toBe(false);
    expect(capture.environment).toEqual({});
    expect(existsSync(reportPath)).toBe(true);
  });

  it('finds the producers of each runner inside the policy root', () => {
    const options = testOptions({ policyRoot: '/policy' });

    expect(consoleProducerPath(options, 'jest')).toBe(
      '/policy/languages/typescript/preset/test-console/runners/jest-reporter.config.mjs',
    );
    expect(consoleProducerPath(options, 'mocha')).toBe(
      '/policy/languages/typescript/preset/test-console/runners/mocha-capture.config.mjs',
    );
  });
});
