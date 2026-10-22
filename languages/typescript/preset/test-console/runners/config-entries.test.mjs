import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PLACE_FILE_VARIABLE,
  PLACE_TEST_VARIABLE,
  REPORT_VARIABLE,
  ROOT_VARIABLE,
} from '../console-report.mjs';
import testConsoleReporter from './jest-reporter.config.mjs';
import { mochaHooks } from './mocha-hooks.config.mjs';

describe('the files the test runners load by path', () => {
  let directory;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'config-entries-'));
    vi.stubEnv(ROOT_VARIABLE, '/work/app');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  });

  it('gives Jest a reporter that writes the report named by the environment', () => {
    const reportPath = path.join(directory, 'report.json');
    vi.stubEnv(REPORT_VARIABLE, reportPath);

    const reporter = new testConsoleReporter();
    reporter.onTestResult(
      {},
      { testFilePath: '/work/app/a.test.js', console: [{ type: 'warn', message: 'careful' }] },
    );
    reporter.onRunComplete();

    expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toEqual({
      entries: [{ file: '/work/app/a.test.js', test: '', messages: ['careful'] }],
    });
  });

  it('gives Mocha hooks that name the running test in the environment', () => {
    vi.stubEnv(PLACE_TEST_VARIABLE, '');
    const hooks = mochaHooks();

    hooks.beforeEach.call({ currentTest: { fullTitle: () => 'works' } });

    expect(process.env[PLACE_TEST_VARIABLE]).toBe('works');
    expect(process.env[PLACE_FILE_VARIABLE]).toBe('');
  });
});
