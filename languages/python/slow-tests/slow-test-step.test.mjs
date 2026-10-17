import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectSlowTests, SLOW_TESTS_REPORT } from './slow-test-step.mjs';
import { RERUN_TIMES_REPORT, TEST_TIMES_REPORT } from './timing-command.mjs';

const WRITE_RERUN =
  "const fs = require('node:fs'); const out = process.argv.slice(1).find((a) => a.startsWith('--junitxml='));" +
  "if (out && process.env.RERUN) fs.writeFileSync(out.slice('--junitxml='.length), process.env.RERUN);";
let directory;
let launched;
let behaviour;

function fakeLauncher(factsByRoot) {
  return {
    description: 'fake',
    launch: (tool, args) => {
      launched.push([tool, ...args]);
      const isFacts = args[0] === '-I';
      const printed = printedBy(args, factsByRoot);
      return {
        command: process.execPath,
        args: ['-e', `${WRITE_RERUN}process.stdout.write(process.env.PRINTED)`, '--', ...args],
        env: { PRINTED: printed, RERUN: isFacts ? '' : (behaviour.rerun ?? '') },
      };
    },
  };
}

function printedBy(args, factsByRoot) {
  if (args[0] === '-c') {
    return '8.0.0 0 0';
  }
  return args[0] === '-I' ? behaviour.facts(factsByRoot, args[2]) : '';
}

function printedFacts(factsByRoot, root) {
  return `NITPICKER_FACTS ${JSON.stringify(factsByRoot[root])}\n`;
}

function write(files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    writeFileSync(path.join(directory, name), text);
  }
}

function xml(...cases) {
  const body = cases
    .map(([classname, name, time, file]) => {
      const located = file === undefined ? '' : ` file="${file}"`;
      return `<testcase classname="${classname}" name="${name}"${located} time="${time}"/>`;
    })
    .join('');
  return `<testsuite name="pytest">${body}</testsuite>`;
}

function times(...cases) {
  write({ [`report/${TEST_TIMES_REPORT}`]: xml(...cases) });
}

function context(extra = {}) {
  const root = (name) => path.join(directory, name);
  return {
    projectRoot: root('head'),
    baselineRoot: root('base'),
    reportRoot: root('report'),
    snapshot: 'head',
    project: { testRunner: 'pytest' },
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

function record(extra) {
  return {
    path: 'tests/test_pay.py',
    identity: 'test:tests.test_pay.TestPay#test_slow',
    name: 'test_pay.TestPay test_slow',
    seconds: 6,
    runner: 'pytest',
    line: 5,
    integration: false,
    changed: true,
    ...extra,
  };
}

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-slow-step-'));
  launched = [];
  behaviour = { facts: printedFacts };
  write({
    'head/tests/test_pay.py': 'def test_x(): pass\n',
    'base/tests/test_pay.py': 'def test_x(): pass\n',
    'report/.keep': '',
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
    expect(report()).toEqual({
      tests: [
        record({
          identity: 'test:tests.test_pay.TestPay#test_slow[1-2]',
          name: 'test_pay.TestPay test_slow[1-2]',
          seconds: 7.5,
        }),
        record({
          identity: 'test:tests.test_pay.TestPay#test_slow[2-3]',
          name: 'test_pay.TestPay test_slow[2-3]',
          seconds: 9,
        }),
      ],
      notices: [],
    });
  });

  it('counts every slow test when there is no baseline and finds unittest files under tests', () => {
    times(['test_pay.TestPay', 'test_slow', '6']);
    collectSlowTests(context({ baselineRoot: undefined }));
    expect(report()).toEqual({
      tests: [record({ identity: 'test:test_pay.TestPay#test_slow' })],
      notices: [],
    });
  });

  it('finds the file from the file attribute of the report, also for a dotted folder name', () => {
    write({ 'head/tests/v1.2/test_pay.py': 'def test_x(): pass\n' });
    times(['tests.v1.2.test_pay.TestPay', 'test_slow', '6', 'tests/v1.2/test_pay.py']);
    collectSlowTests(context({ baselineRoot: undefined }));
    expect(report()).toEqual({
      tests: [
        {
          path: 'tests/v1.2/test_pay.py',
          identity: 'test:tests.v1.2.test_pay.TestPay#test_slow',
          name: 'test_pay.TestPay test_slow',
          seconds: 6,
          runner: 'pytest',
          integration: false,
          changed: true,
        },
      ],
      notices: [],
    });
  });

  it('says so when a slow test cannot be found in the project', () => {
    times(['elsewhere.test_pay.TestPay', 'test_slow', '6']);
    collectSlowTests(context());
    expect(report()).toEqual({
      tests: [],
      notices: [
        {
          path: '.',
          message:
            'elsewhere.test_pay.TestPay test_slow took 6.0 s, but its file was not found under the ' +
            'project root, so it is not checked for slow tests',
        },
      ],
    });
  });

  it('reads the budget floor from the thresholds', () => {
    times(['tests.test_pay.TestPay', 'test_slow', '1.5']);
    collectSlowTests(context({ testSeconds: { unitTestSeconds: 1 } }));
    expect(report().tests.map(({ identity }) => identity)).toEqual([
      'test:tests.test_pay.TestPay#test_slow',
    ]);
  });

  it('counts a test with no function of that name when its file differs from the base', () => {
    times(['tests.test_pay.TestPay', 'test_generated', '6']);
    write({ 'head/tests/test_pay.py': 'def test_y(): pass\n' });
    collectSlowTests(context());
    expect(report().tests.map(({ changed, line }) => [changed, line])).toEqual([[true, undefined]]);
  });

  it('counts a test whose file did not parse on the base', () => {
    times(['tests.test_pay.TestPay', 'test_same', '8']);
    behaviour.facts = (factsByRoot, root) =>
      printedFacts(
        {
          ...factsByRoot,
          [path.join(directory, 'base')]: { 'tests/test_pay.py': null },
        },
        root,
      );
    collectSlowTests(context());
    expect(report().tests.map(({ identity, changed }) => [identity, changed])).toEqual([
      ['test:tests.test_pay.TestPay#test_same', true],
    ]);
  });

  it('writes nothing on the base snapshot, without a times file, or when no test is slow', () => {
    collectSlowTests(context());
    expect(report()).toEqual({ tests: [], notices: [] });
    times(['tests.test_pay.TestPay', 'test_slow', '7']);
    collectSlowTests(context({ snapshot: 'base' }));
    expect(report()).toEqual({ tests: [], notices: [] });
    times(['tests.test_pay.TestPay', 'test_slow', '0.1']);
    collectSlowTests(context());
    expect(report()).toEqual({ tests: [], notices: [] });
  });
});

describe('the timing run without coverage', () => {
  it('re-times the changed slow tests by pytest node id and keeps the new time', () => {
    times(
      ['tests.test_pay.TestPay', 'test_slow[1-2]', '7.5'],
      ['tests.test_pay.TestPay', 'test_same', '8.0'],
    );
    behaviour.rerun = xml(['tests.test_pay.TestPay', 'test_slow[1-2]', '1.25']);
    collectSlowTests(context());
    const rerun = launched.find(([, ...args]) => args.some((arg) => arg.startsWith('--junitxml=')));
    expect(rerun).toEqual([
      'python',
      '-m',
      'pytest',
      '-q',
      '-o',
      `cache_dir=${path.join(directory, 'report', 'pytest-cache')}`,
      'tests/test_pay.py::TestPay::test_slow[1-2]',
      `--junitxml=${path.join(directory, 'report', RERUN_TIMES_REPORT)}`,
      '-o',
      'junit_family=xunit1',
      '-o',
      'junit_duration_report=call',
    ]);
    expect(report().tests.map(({ seconds }) => seconds)).toEqual([1.25]);
  });

  it('keeps the time of the run with coverage when the second run wrote no report', () => {
    times(['tests.test_pay.TestPay', 'test_slow', '7.5']);
    collectSlowTests(context());
    expect(report().tests.map(({ seconds }) => seconds)).toEqual([7.5]);
  });

  it('does not run again when no changed test is slow', () => {
    times(['tests.test_pay.TestPay', 'test_same', '8.0']);
    collectSlowTests(context());
    expect(launched.filter(([, ...args]) => args.includes('-m'))).toEqual([]);
  });

  it('asks unittest for the tests by id with the same discovery arguments', () => {
    times(['tests.test_pay.TestPay', 'test_slow', '7.5']);
    collectSlowTests(
      context({
        project: { testRunner: 'unittest' },
        reportRoot: path.join(directory, 'report'),
      }),
    );
    const rerun = launched.find(([, ...args]) =>
      args.some((arg) => arg.endsWith('.py') && arg.includes('unittest_timing')),
    );
    expect(rerun?.slice(-2)).toEqual(['-k', 'tests.test_pay.TestPay.test_slow']);
  });
});

describe('when the Python facts or the timing report are missing', () => {
  it('keeps the other findings and names the files it could not read when the helper fails', () => {
    times(['tests.test_pay.TestPay', 'test_slow', '7']);
    behaviour.facts = () => 'Traceback: RecursionError\n';
    collectSlowTests(context());
    expect(report()).toEqual({
      tests: [],
      notices: [
        {
          path: 'tests/test_pay.py',
          message:
            'tests/test_pay.py is not checked for slow tests: reading its tests failed, it exited 0 ' +
            'and printed no facts',
        },
      ],
    });
  });

  it('says that nothing was timed when the tests ran but wrote no report', () => {
    collectSlowTests(context(), { testsRan: true });
    expect(report().notices.map(({ message }) => message)).toEqual([
      'The test run wrote no timing report, so slow tests were not checked (a project that disables ' +
        "pytest's JUnit report with -p no:junitxml is not timed)",
    ]);
    collectSlowTests(context(), { testsRan: false });
    expect(report().notices).toEqual([]);
  });
});
