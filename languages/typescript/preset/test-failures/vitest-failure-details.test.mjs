import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import failureDetailsReporter, {
  FAILURE_DETAILS_VARIABLE,
} from './vitest-failure-details.config.mjs';

function testCase(name, parent, result) {
  return { name, parent, result: () => result };
}

describe('the vitest failure details reporter', () => {
  let folder;

  beforeEach(() => {
    folder = mkdtempSync(path.join(tmpdir(), 'details-'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(folder, { recursive: true, force: true });
  });

  it('writes each failing test with its suites and the values of its first error', () => {
    const reportPath = path.join(folder, 'details.json');
    vi.stubEnv(FAILURE_DETAILS_VARIABLE, reportPath);
    const outer = { type: 'suite', name: 'cart', parent: { type: 'module' } };
    const inner = { type: 'suite', name: 'totals', parent: outer };
    const tests = [
      testCase('adds', inner, { state: 'failed', errors: [{ expected: '4', actual: '3' }] }),
      testCase('throws', outer, { state: 'failed', errors: [{ message: 'boom' }] }),
      testCase('passes', outer, { state: 'passed' }),
    ];
    const testModule = { moduleId: '/p/test/cart.test.ts', children: { allTests: () => tests } };

    failureDetailsReporter().onTestRunEnd([testModule]);

    expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toEqual([
      { file: '/p/test/cart.test.ts', name: 'cart totals adds', expected: '4', actual: '3' },
      { file: '/p/test/cart.test.ts', name: 'cart throws' },
    ]);
  });

  it('writes nothing without a report path', () => {
    vi.stubEnv(FAILURE_DETAILS_VARIABLE, '');

    failureDetailsReporter().onTestRunEnd([]);

    expect(readdirSync(folder)).toEqual([]);
  });
});
