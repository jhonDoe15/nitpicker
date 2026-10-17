import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { rerunCommand, retimeSlowTests } from './slow-retime.mjs';
import { readSlowTestFindings } from './slow-tests.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const SLOW =
  'import time\n\n\ndef test_wait():\n    time.sleep(6)\n\n\ndef test_other():\n    pass\n';

function directory(files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-slow-retime-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function testcase([file, name, seconds, children = '']) {
  const classname = file.replace(/\.py$/u, '').replaceAll('/', '.');
  const attributes = `classname="${classname}" name="${name}" file="${file}" line="3"`;
  return `<testcase ${attributes} time="${String(seconds)}">${children}</testcase>`;
}

function junit(cases) {
  const body = cases.map(testcase).join('');
  return `<testsuites><testsuite>${body}</testsuite></testsuites>`;
}

function launcher(calls, rerunXml) {
  return {
    description: 'test',
    launch(tool, args) {
      calls.push([tool, ...args]);
      const write =
        rerunXml === undefined
          ? ''
          : `require('fs').writeFileSync(${JSON.stringify(rerunXml.file)}, ${JSON.stringify(rerunXml.text)});`;
      return {
        command: process.execPath,
        args: ['-e', `${write}console.log('8.3.0 0 0 0')`],
        env: {},
      };
    },
  };
}

function setup({ report, rerun, runner = 'pytest' }) {
  const projectRoot = directory({ 'tests/test_a.py': SLOW });
  const reportRoot = directory({ 'pytest-junit.xml': report });
  const calls = [];
  const rerunFile = path.join(reportRoot, 'rerun-junit.xml');
  const context = {
    projectRoot,
    reportRoot,
    snapshot: 'head',
    env: {},
    project: { testRunner: runner },
    launcher: launcher(calls, rerun === undefined ? undefined : { file: rerunFile, text: rerun }),
  };
  return { context, calls, options: { projectRoot, reportRoot, testsRan: true } };
}

describe('timing slow tests again without coverage', () => {
  it('selects the slow pytest tests by node id and writes the second report beside the first', () => {
    const { context, calls } = setup({ report: junit([['tests/test_a.py', 'test_wait', 7]]) });

    retimeSlowTests(context, { testsRan: true });

    expect(calls.at(-1).slice(0, 1)).toEqual(['python']);
    expect(calls.at(-1).filter((argument) => argument.includes('rerun-junit.xml'))).toEqual([
      `--junitxml=${path.join(context.reportRoot, 'rerun-junit.xml')}`,
    ]);
    expect(calls.at(-1).at(-1)).toBe('tests/test_a.py::test_wait');
    expect(calls.at(-1).includes('coverage')).toBe(false);
  });

  it('selects unittest tests by their dotted id', () => {
    const { context } = setup({
      report: junit([['tests/test_a.py', 'test_wait', 7]]),
      runner: 'unittest',
    });

    expect(
      rerunCommand(context, [
        { testCase: { qualifiedClass: 'tests.test_a', functionName: 'test_wait' } },
      ]).slice(-2),
    ).toEqual(['-k', 'tests.test_a.test_wait']);
  });

  it('runs nothing when no test is over budget or the tests did not run', () => {
    const quick = setup({ report: junit([['tests/test_a.py', 'test_wait', 1]]) });
    const idle = setup({ report: junit([['tests/test_a.py', 'test_wait', 7]]) });

    retimeSlowTests(quick.context, { testsRan: true });
    retimeSlowTests(idle.context, { testsRan: false });

    expect([quick.calls, idle.calls]).toEqual([[], []]);
  });

  it('reports only a test that is still over budget, with the time of the second run', () => {
    const report = junit([['tests/test_a.py', 'test_wait', 7]]);
    const noisy = setup({ report });
    const real = setup({ report });
    writeFileSync(
      path.join(noisy.options.reportRoot, 'rerun-junit.xml'),
      junit([['tests/test_a.py', 'test_wait', 1.2]]),
    );
    writeFileSync(
      path.join(real.options.reportRoot, 'rerun-junit.xml'),
      junit([['tests/test_a.py', 'test_wait', 5.5]]),
    );

    expect(readSlowTestFindings(noisy.options)).toEqual([]);
    expect(readSlowTestFindings(real.options).map(({ message }) => message.split(';')[0])).toEqual([
      'test_wait took 5.5 s',
    ]);
  });

  it('keeps the first time when the second run failed', () => {
    const failed = '<failure message="boom"/>';
    const { options } = setup({ report: junit([['tests/test_a.py', 'test_wait', 7]]) });
    writeFileSync(
      path.join(options.reportRoot, 'rerun-junit.xml'),
      junit([['tests/test_a.py', 'test_wait', 1, failed]]),
    );

    expect(readSlowTestFindings(options).map(({ message }) => message.split(';')[0])).toEqual([
      'test_wait took 7.0 s',
    ]);
  });
});

describe('what slow test checking leaves out and says', () => {
  it('times passed tests only', () => {
    const { options } = setup({
      report: junit([
        ['tests/test_a.py', 'test_wait', 9, '<failure message="x"/>'],
        ['tests/test_a.py', 'test_other', 9, '<skipped message="x"/>'],
      ]),
    });

    expect(readSlowTestFindings(options)).toEqual([]);
  });

  it('says so, without failing, when a run that ran tests wrote no timing report', () => {
    const projectRoot = directory();
    const reportRoot = directory();

    expect(readSlowTestFindings({ projectRoot, reportRoot, testsRan: true })).toEqual([
      {
        tool: 'test-runtime',
        rule: 'slow-test-not-timed',
        path: '.',
        identity: 'slow-test-not-timed:.',
        message:
          'The test run wrote no timing report, so slow tests were not checked ' +
          '(a project that disables the JUnit report is not timed)',
        classification: 'descriptive',
      },
    ]);
    expect(readSlowTestFindings({ projectRoot, reportRoot, testsRan: false })).toEqual([]);
  });

  it('keeps the other files when one test file cannot be read', () => {
    const { options } = setup({
      report: junit([
        ['../escape.py', 'test_wait', 9],
        ['tests/test_a.py', 'test_wait', 9],
      ]),
    });

    expect(readSlowTestFindings(options).map(({ rule, path: file }) => [rule, file])).toEqual([
      ['slow-test-not-timed', '../escape.py'],
      ['slow-test', 'tests/test_a.py'],
    ]);
  });
});
