import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINES_VARIABLE } from '../console-capture.mjs';
import { REPORT_VARIABLE, ROOT_VARIABLE } from '../console-report.mjs';
import testConsoleReporter from './jest-reporter.config.mjs';
import { mochaHooks } from './mocha-hooks.config.mjs';
import installed from './node-test-preload.config.cjs';

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

  it('gives Mocha hooks that record the console calls into the lines file', () => {
    const linesPath = path.join(directory, 'lines.jsonl');
    vi.stubEnv(LINES_VARIABLE, linesPath);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const hooks = mochaHooks();
    console.warn('careful');

    expect(typeof hooks.beforeEach).toBe('function');
    expect(readFileSync(linesPath, 'utf8')).toBe(
      `${JSON.stringify({ file: '', test: '', messages: ['careful'] })}\n`,
    );
  });

  it('does nothing in a process that is not a node:test file process', () => {
    expect(installed).toBe(false);
  });
});
