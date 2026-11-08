import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSlowTestFindings } from './slow-tests.mjs';

const FIX =
  'Remove fixed sleeps and real timers (use fake timers) and mock network, database and disk access';
const MOVE =
  ', or move it to an integration test (an integration or e2e folder under the test roots, ' +
  'or *.integration.test.*) if it is one';
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
  return (
    `${path.posix.basename(file)} ${name} took ${seconds} s; a unit test may take ${limit} ` +
    `s. ${FIX}${MOVE}. If this is intended, add ` +
    `{"rule":"slow-test","paths":["${file}"],"reason":"..."} ` +
    'to "exceptions" in nitpicker.config.json.'
  );
}

function keepFirstTimings() {
  return vi.fn(() => Promise.resolve(new Map()));
}

function findingsOf(settings, report, retime = keepFirstTimings()) {
  return readSlowTestFindings(settings, report, retime);
}

function identities(findings) {
  return findings.map(({ identity }) => identity);
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
  it('fails a unit test over five seconds and names the fix and the exception', async () => {
    const report = reportOf('src/orders.test.ts', [
      ['orders pays', 6200],
      ['orders refunds', 900],
    ]);
    expect(await findingsOf(options(), report)).toEqual([
      {
        tool: 'test-runtime',
        rule: 'slow-test',
        path: 'src/orders.test.ts',
        identity: 'test:orders pays',
        location: { line: 2 },
        message: unitMessage({ seconds: '6.2', file: 'src/orders.test.ts', name: 'orders pays' }),
        allowedForm: `${FIX}${MOVE}.`,
        classification: 'enforceable',
      },
    ]);
  });

  it('gives an integration test the integration budget', async () => {
    write({ 'head/test/integration/db.test.ts': TEST_FILE });
    const slow = reportOf('test/integration/db.test.ts', [['orders pays', 29000]]);
    const slower = reportOf('test/integration/db.test.ts', [['orders pays', 31000]]);
    expect(await findingsOf(options(), slow)).toEqual([]);
    expect(await findingsOf(options(), slower)).toEqual([
      {
        tool: 'test-runtime',
        rule: 'slow-test',
        path: 'test/integration/db.test.ts',
        identity: 'test:orders pays',
        location: { line: 2 },
        message:
          `db.test.ts orders pays took 31.0 s; an integration test may take 30 s. ${FIX}. If this ` +
          `is intended, add ` +
          `{"rule":"slow-test","paths":["test/integration/db.test.ts"],"reason":"..."} ` +
          `to "exceptions" in nitpicker.config.json.`,
        allowedForm: `${FIX}.`,
        classification: 'enforceable',
      },
    ]);
  });

  it('keeps the integration folders of production code at the unit budget', async () => {
    write({ 'head/src/integrations/stripe.test.ts': TEST_FILE });
    const report = reportOf('src/integrations/stripe.test.ts', [['orders pays', 6000]]);
    expect((await findingsOf(options(), report)).map(({ message }) => message)).toEqual([
      unitMessage({ seconds: '6.0', file: 'src/integrations/stripe.test.ts', name: 'orders pays' }),
    ]);
  });

  it('reads the budgets from thresholds and lifts the rule with an exception', async () => {
    const report = reportOf('src/orders.test.ts', [['orders refunds', 2500]]);
    writePolicy({ thresholds: { unitTestSeconds: 2 } });
    expect((await findingsOf(options(), report)).map(({ message }) => message)).toEqual([
      unitMessage({ seconds: '2.5', file: 'src/orders.test.ts', name: 'orders refunds', limit: 2 }),
    ]);
    writePolicy({
      thresholds: { unitTestSeconds: 2 },
      exceptions: [{ rule: 'slow-test', paths: ['src/**'], reason: 'real database' }],
    });
    expect(await findingsOf(options(), report)).toEqual([]);
  });

  it('skips the files the config excludes', async () => {
    write({ 'head/src/legacy/old.test.ts': TEST_FILE });
    writePolicy({ exclude: ['src/legacy/**'] });
    const report = reportOf('src/legacy/old.test.ts', [['orders pays', 9000]]);
    expect(await findingsOf(options(), report)).toEqual([]);
  });

  it('reports nothing on the base snapshot and counts every slow test without a baseline', async () => {
    const report = reportOf('src/orders.test.ts', [['orders pays', 9000]]);
    expect(await findingsOf(options({ snapshot: 'base' }), report)).toEqual([]);
    expect(identities(await findingsOf(options(), report))).toEqual(['test:orders pays']);
  });

  it('keeps a slow test the change does not touch baselined and fails one it edits or adds', async () => {
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
    expect(identities(await findingsOf(baselined, report))).toEqual([
      'test:orders refunds',
      'test:adds',
    ]);
  });

  it('ignores a reformatted test and counts a table test when anything in its file changed', async () => {
    const table =
      "const CASES = [1];\nit.each(CASES)('row %i', () => { run(); });\nit('plain', () => { run(); });\n";
    write({
      'base/src/table.test.ts': table,
      'head/src/table.test.ts': table
        .replace('[1]', '[1, 2]')
        .replace('{ run(); }', '{\n  run();\n}')
        .replace("it('plain', () => { run(); });", "it('plain', () => {\n  run();\n});"),
    });
    const baselined = options({ baselineRoot: path.join(directory, 'base') });
    const report = reportOf('src/table.test.ts', [
      ['row 1', 9000],
      ['plain', 9000],
    ]);
    expect(identities(await findingsOf(baselined, report))).toEqual(['test:row 1']);
  });

  it('counts a test of a new file and a test no call names when its file changed', async () => {
    write({
      'base/src/other.test.ts': 'it("x", () => {});\n',
      'head/src/other.test.ts': 'it("y", () => {});\n',
    });
    const baselined = options({ baselineRoot: path.join(directory, 'base') });
    const created = reportOf('src/orders.test.ts', [['orders pays', 9000]]);
    const unnamed = reportOf('src/other.test.ts', [['generated', 9000]]);
    expect(identities(await findingsOf(baselined, created))).toEqual(['test:orders pays']);
    expect(identities(await findingsOf(baselined, unnamed))).toEqual(['test:generated']);
  });

  it('ignores failed, skipped and untimed tests and files outside the project', async () => {
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
    expect(await findingsOf(options(), report)).toEqual([]);
  });

  it('finds the tests of a project reached through a symbolic link', async () => {
    symlinkSync(path.join(directory, 'head'), path.join(directory, 'linked'));
    const report = reportOf('src/orders.test.ts', [['orders pays', 9000]]);
    const linked = options({ projectRoot: path.join(directory, 'linked') });
    expect(identities(await findingsOf(linked, report))).toEqual(['test:orders pays']);
  });
});

describe('the timing run without coverage', () => {
  const slow = () =>
    reportOf('src/orders.test.ts', [
      ['orders pays', 9000],
      ['orders refunds', 800],
    ]);

  it('re-times only the slow tests, with the file and name of each', async () => {
    const retime = keepFirstTimings();
    await findingsOf(options(), slow(), retime);
    expect(retime.mock.calls).toEqual([
      [options(), [{ file: 'src/orders.test.ts', name: 'orders pays', seconds: 9 }]],
    ]);
  });

  it('does not run it when no test is slow or the change did not touch the slow ones', async () => {
    const retime = keepFirstTimings();
    await findingsOf(options(), reportOf('src/orders.test.ts', [['orders pays', 900]]), retime);
    write({ 'base/src/orders.test.ts': TEST_FILE });
    const baselined = options({ baselineRoot: path.join(directory, 'base') });
    await findingsOf(baselined, slow(), retime);
    expect(retime.mock.calls).toEqual([]);
  });

  it('reports a test only while its timing without coverage is over the budget', async () => {
    const quicker = vi.fn(() =>
      Promise.resolve(new Map([['src/orders.test.ts\0orders pays', 1.5]])),
    );
    expect(await findingsOf(options(), slow(), quicker)).toEqual([]);
    const slower = vi.fn(() =>
      Promise.resolve(new Map([['src/orders.test.ts\0orders pays', 7.25]])),
    );
    expect((await findingsOf(options(), slow(), slower)).map(({ message }) => message)).toEqual([
      unitMessage({ seconds: '7.3', file: 'src/orders.test.ts', name: 'orders pays' }),
    ]);
  });
});
