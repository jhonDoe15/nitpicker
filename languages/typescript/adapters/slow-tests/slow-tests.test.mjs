import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSlowTestFindings } from './slow-tests.mjs';

const FIX =
  'Remove fixed sleeps and real timers (use fake timers) and mock network, database and disk access';
const MOVE =
  ', or move it to an integration test (an integration or e2e folder, or *.integration.test.*) if it is one';
const TEST_FILE = `describe('orders', () => {
  it('pays', () => {
    expect(pay()).toBe(1);
  });
  it('refunds', () => {
    expect(refund()).toBe(1);
  });
});
`;
let directory;

function write(files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    writeFileSync(path.join(directory, name), text);
  }
}

function writePolicy(policy) {
  write({
    'policy.json': JSON.stringify({
      exclude: [],
      layout: {},
      exceptions: [],
      thresholds: {},
      ...policy,
    }),
  });
  vi.stubEnv('NITPICKER_POLICY', path.join(directory, 'policy.json'));
}

function reportOf(file, runs) {
  return {
    numTotalTests: runs.length,
    testResults: [
      {
        name: path.join(directory, 'head', file),
        status: 'passed',
        assertionResults: runs.map(([fullName, duration]) => ({
          fullName,
          title: fullName,
          status: 'passed',
          duration,
        })),
      },
    ],
  };
}

function options(extra = {}) {
  return {
    projectRoot: path.join(directory, 'head'),
    analyzerName: 'coverage',
    snapshot: 'head',
    ...extra,
  };
}

function unitMessage({ seconds, file, name, limit = 5 }) {
  return `${path.posix.basename(file)} ${name} took ${seconds} s; a unit test may take ${limit} s. ${FIX}${MOVE}. If this is intended, add {"rule":"slow-test","paths":["${file}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`;
}

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-slow-tests-'));
  writePolicy({});
  write({ 'head/src/orders.test.ts': TEST_FILE });
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

describe('slow tests from a runner report', () => {
  it('fails a unit test over five seconds and names the fix and the exception', () => {
    const report = reportOf('src/orders.test.ts', [
      ['orders pays', 6200],
      ['orders refunds', 900],
    ]);
    expect(readSlowTestFindings(options(), report)).toEqual([
      {
        tool: 'coverage',
        rule: 'slow-test',
        path: 'src/orders.test.ts',
        identity: 'test:orders pays',
        location: { line: 2 },
        message: unitMessage({ seconds: '6.2', file: 'src/orders.test.ts', name: 'orders pays' }),
        classification: 'enforceable',
      },
    ]);
  });

  it('gives an integration test the integration budget', () => {
    write({ 'head/test/integration/db.test.ts': TEST_FILE });
    const slow = reportOf('test/integration/db.test.ts', [['orders pays', 29000]]);
    const slower = reportOf('test/integration/db.test.ts', [['orders pays', 31000]]);
    expect(readSlowTestFindings(options(), slow)).toEqual([]);
    expect(readSlowTestFindings(options(), slower)).toEqual([
      {
        tool: 'coverage',
        rule: 'slow-test',
        path: 'test/integration/db.test.ts',
        identity: 'test:orders pays',
        location: { line: 2 },
        message: `db.test.ts orders pays took 31.0 s; an integration test may take 30 s. ${FIX}. If this is intended, add {"rule":"slow-test","paths":["test/integration/db.test.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.`,
        classification: 'enforceable',
      },
    ]);
  });

  it('reads the budgets from thresholds and lifts the rule with an exception', () => {
    const report = reportOf('src/orders.test.ts', [['orders refunds', 2500]]);
    writePolicy({ thresholds: { unitTestSeconds: 2 } });
    expect(readSlowTestFindings(options(), report).map(({ message }) => message)).toEqual([
      unitMessage({ seconds: '2.5', file: 'src/orders.test.ts', name: 'orders refunds', limit: 2 }),
    ]);
    writePolicy({
      thresholds: { unitTestSeconds: 2 },
      exceptions: [{ rule: 'slow-test', paths: ['src/**'], reason: 'real database' }],
    });
    expect(readSlowTestFindings(options(), report)).toEqual([]);
  });

  it('reports nothing on the base snapshot and counts every slow test without a baseline', () => {
    const report = reportOf('src/orders.test.ts', [['orders pays', 9000]]);
    expect(readSlowTestFindings(options({ snapshot: 'base' }), report)).toEqual([]);
    expect(readSlowTestFindings(options(), report)).toHaveLength(1);
  });

  it('keeps a slow test the change does not touch baselined and fails one it edits or adds', () => {
    write({
      'base/src/orders.test.ts': TEST_FILE,
      'head/src/orders.test.ts': TEST_FILE.replace('refund()).toBe(1)', 'refund()).toBe(2)').concat(
        "it('adds', () => {});\n",
      ),
    });
    const report = reportOf('src/orders.test.ts', [
      ['orders pays', 9000],
      ['orders refunds', 9000],
      ['adds', 9000],
    ]);
    const baselined = options({ baselineRoot: path.join(directory, 'base') });
    expect(readSlowTestFindings(baselined, report).map(({ identity }) => identity)).toEqual([
      'test:orders refunds',
      'test:adds',
    ]);
  });

  it('counts a test of a new file and a test no call names when its file changed', () => {
    write({
      'base/src/other.test.ts': 'it("x", () => {});\n',
      'head/src/other.test.ts': 'it("y", () => {});\n',
    });
    const baselined = options({ baselineRoot: path.join(directory, 'base') });
    const created = reportOf('src/orders.test.ts', [['orders pays', 9000]]);
    const unnamed = reportOf('src/other.test.ts', [['generated', 9000]]);
    expect(readSlowTestFindings(baselined, created)).toHaveLength(1);
    expect(readSlowTestFindings(baselined, unnamed).map(({ identity }) => identity)).toEqual([
      'test:generated',
    ]);
  });

  it('ignores failed, skipped and untimed tests and files outside the project', () => {
    const report = {
      testResults: [
        {
          name: '/elsewhere/a.test.ts',
          assertionResults: [{ fullName: 'a', status: 'passed', duration: 99000 }],
        },
        {
          name: path.join(directory, 'head/src/orders.test.ts'),
          assertionResults: [
            { fullName: 'orders pays', status: 'failed', duration: 99000 },
            { fullName: 'orders refunds', status: 'pending', duration: null },
          ],
        },
      ],
    };
    expect(readSlowTestFindings(options(), report)).toEqual([]);
  });
});
