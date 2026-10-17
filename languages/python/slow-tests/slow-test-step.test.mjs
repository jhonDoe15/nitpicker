import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectSlowTests, SLOW_TESTS_REPORT } from './slow-test-step.mjs';
import { TEST_TIMES_REPORT } from './timing-command.mjs';

let directory;

function fakeLauncher(factsByRoot) {
  return {
    description: 'fake',
    launch: (_tool, args) => ({
      command: process.execPath,
      args: ['-e', 'process.stdout.write(process.env.FACTS)'],
      env: { FACTS: JSON.stringify(factsByRoot[args[2]]) },
    }),
  };
}

function write(files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    writeFileSync(path.join(directory, name), text);
  }
}

function times(...cases) {
  const body = cases
    .map(
      ([classname, name, time]) =>
        `<testcase classname="${classname}" name="${name}" time="${time}"/>`,
    )
    .join('');
  write({ [`report/${TEST_TIMES_REPORT}`]: `<testsuite name="pytest">${body}</testsuite>` });
}

function context(extra = {}) {
  const root = (name) => path.join(directory, name);
  return {
    projectRoot: root('head'),
    baselineRoot: root('base'),
    reportRoot: root('report'),
    snapshot: 'head',
    launcher: fakeLauncher({
      [root('head')]: {
        'tests/test_pay.py': {
          'TestPay.test_slow': { line: 5, hash: 'new', markers: [] },
          'TestPay.test_same': { line: 9, hash: 'same', markers: ['integration'] },
        },
      },
      [root('base')]: {
        'tests/test_pay.py': {
          'TestPay.test_slow': { line: 5, hash: 'old', markers: [] },
          'TestPay.test_same': { line: 9, hash: 'same', markers: [] },
        },
      },
    }),
    ...extra,
  };
}

function report() {
  return JSON.parse(readFileSync(path.join(directory, 'report', SLOW_TESTS_REPORT), 'utf8'));
}

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-slow-step-'));
  write({
    'head/tests/test_pay.py': 'def test_x(): pass\n',
    'base/tests/test_pay.py': 'def test_x(): pass\n',
  });
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('collecting slow tests after the run', () => {
  it('records each slow test with its budget kind and whether the change touched it', () => {
    times(
      ['tests.test_pay.TestPay', 'test_slow[1-2]', '7.5'],
      ['tests.test_pay.TestPay', 'test_slow[2-3]', '9.0'],
      ['tests.test_pay.TestPay', 'test_same', '8.0'],
      ['tests.test_pay.TestPay', 'test_quick', '0.2'],
    );
    collectSlowTests(context());
    expect(report()).toEqual([
      {
        path: 'tests/test_pay.py',
        identity: 'test:tests.test_pay.TestPay#test_slow[1-2]',
        name: 'test_pay.TestPay test_slow[1-2]',
        seconds: 7.5,
        line: 5,
        integration: false,
        changed: true,
      },
      {
        path: 'tests/test_pay.py',
        identity: 'test:tests.test_pay.TestPay#test_slow[2-3]',
        name: 'test_pay.TestPay test_slow[2-3]',
        seconds: 9,
        line: 5,
        integration: false,
        changed: true,
      },
      {
        path: 'tests/test_pay.py',
        identity: 'test:tests.test_pay.TestPay#test_same',
        name: 'test_pay.TestPay test_same',
        seconds: 8,
        line: 9,
        integration: true,
        changed: false,
      },
    ]);
  });

  it('counts every slow test when there is no baseline and finds unittest files under tests', () => {
    times(['test_pay.TestPay', 'test_slow', '6']);
    collectSlowTests(context({ baselineRoot: undefined }));
    expect(report()).toEqual([
      {
        path: 'tests/test_pay.py',
        identity: 'test:test_pay.TestPay#test_slow',
        name: 'test_pay.TestPay test_slow',
        seconds: 6,
        line: 5,
        integration: false,
        changed: true,
      },
    ]);
  });

  it('reads the budget floor from the thresholds', () => {
    times(['tests.test_pay.TestPay', 'test_slow', '1.5']);
    collectSlowTests(context({ testSeconds: { unitTestSeconds: 1 } }));
    expect(report().map(({ identity }) => identity)).toEqual([
      'test:tests.test_pay.TestPay#test_slow',
    ]);
  });

  it('counts a test with no function of that name when its file differs from the base', () => {
    times(['tests.test_pay.TestPay', 'test_generated', '6']);
    write({ 'head/tests/test_pay.py': 'def test_y(): pass\n' });
    collectSlowTests(context());
    expect(report().map(({ changed, line }) => [changed, line])).toEqual([[true, undefined]]);
  });

  it('writes nothing on the base snapshot, without a times file, or when no test is slow', () => {
    collectSlowTests(context());
    expect(existsSync(path.join(directory, 'report', SLOW_TESTS_REPORT))).toBe(false);
    times(['tests.test_pay.TestPay', 'test_slow', '7']);
    collectSlowTests(context({ snapshot: 'base' }));
    expect(existsSync(path.join(directory, 'report', SLOW_TESTS_REPORT))).toBe(false);
    times(['tests.test_pay.TestPay', 'test_slow', '0.1']);
    collectSlowTests(context());
    expect(report()).toEqual([]);
  });
});
