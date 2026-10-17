import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeToolchain } from '../../test-support/fake-toolchain.mjs';
import { createToolContext } from '../../python-tools.mjs';
import { failedOnProjectTests } from './mutation-scope.mjs';
import { mutationFindings } from '../python-mutation.mjs';

const roots = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-mutation-scope-')));
  roots.push(root);
  return root;
}

function project(files = {}) {
  const root = temporaryRoot();
  installFakeToolchain(path.join(root, '.venv/bin'));
  const all = {
    'src/demo/a.py': 'def value():\n    return 1\n',
    'tests/conftest.py': '',
    ...files,
  };
  for (const [file, text] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function callsLog() {
  const log = path.join(temporaryRoot(), 'calls.jsonl');
  writeFileSync(log, '');
  vi.stubEnv('FAKE_PYTHON_LOG', log);
  return () =>
    readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
}

const contextFor = (root, settings = {}) =>
  createToolContext({ projectRoot: root, liveRoot: root, reportRoot: temporaryRoot(), settings });

const FAILING_JUNIT =
  '<testsuites><testsuite>' +
  '<testcase classname="tests.test_a" name="test_x" file="tests/test_a.py" line="0" time="0"><failure/></testcase>' +
  '<testcase classname="tests.test_b" name="test_y" file="tests/test_b.py" line="0" time="0"/>' +
  '</testsuite></testsuites>';

const FAILING_FILES = {
  'junit.xml': FAILING_JUNIT,
  'mutmut-failing-tests.txt': 'tests/test_a.py\n',
};
const DJANGO_MANAGE =
  'import os\n\nos.environ.setdefault("DJANGO_SETTINGS_MODULE", "site.settings")\n';

describe('what mutation testing runs against', () => {
  it('leaves out the failing test modules and mutates against the tests that pass', () => {
    const calls = callsLog();
    const root = project({
      'junit.xml': FAILING_JUNIT,
      'mutmut-failing-tests.txt': 'tests/test_a.py\n',
    });

    const findings = mutationFindings(contextFor(root));

    const mutmut = calls().filter(({ tool }) => tool === 'mutmut');
    expect(mutmut.map(({ pytestAddopts }) => pytestAddopts)).toEqual([
      undefined,
      '--ignore=tests/test_a.py',
    ]);
    expect(findings.filter(({ classification }) => classification === 'tool-error')).toEqual([]);
  });
  it.each([
    ['nose2', {}, '-o python_files=test*.py', undefined],
    [
      'django',
      { 'manage.py': DJANGO_MANAGE, 'pytest-django.txt': '' },
      '-o python_files=test*.py -o django_find_project=false',
      'site.settings',
    ],
  ])(
    'finds the failing modules of a %s project with the options and settings mutmut gets',
    (testRunner, files, pytestAddopts, djangoSettings) => {
      const calls = callsLog();
      vi.stubEnv('PYTEST_ADDOPTS', undefined);
      vi.stubEnv('DJANGO_SETTINGS_MODULE', undefined);
      const root = project({ ...FAILING_FILES, ...files });

      mutationFindings(contextFor(root, { testRunner }));

      const fallback = calls().filter(
        ({ tool, args }) => tool === 'python' && args[0].endsWith('pytest_timings.py'),
      );
      expect(fallback.map((call) => [call.pytestAddopts, call.djangoSettings])).toEqual([
        [pytestAddopts, djangoSettings],
      ]);
    },
  );
  it('skips with a reason when every test module fails', () => {
    const root = project({
      'junit.xml': FAILING_JUNIT,
      'mutmut-failing-tests.txt': 'tests/test_a.py\n',
      'mutmut-only-failing.txt': '',
    });

    expect(mutationFindings(contextFor(root))).toEqual([
      {
        tool: 'mutmut',
        rule: 'tests-failed-skipped',
        path: '.',
        identity: 'tests-failed-skipped',
        classification: 'tool-error',
        message:
          'Mutation testing (mutmut) did not run in the head snapshot: every test module fails (tests/test_a.py), so no passing test is left to run against the mutants. Make the tests pass.',
      },
    ]);
  });
  it('skips alone, before probing mutmut, when the environment runs Python before 3.10', () => {
    const calls = callsLog();
    const root = project({ 'python-version.txt': '3.9\n' });

    expect(mutationFindings(contextFor(root))).toEqual([
      {
        tool: 'mutmut',
        rule: 'tool-skipped',
        path: '.',
        identity: 'tool-skipped',
        classification: 'tool-error',
        message:
          'Mutation testing (mutmut) did not run in the head snapshot: mutmut needs Python 3.10 or newer, and the virtualenv environment runs Python 3.9. The other analyzers still ran.',
      },
    ]);
    expect(calls().filter(({ tool }) => tool === 'mutmut')).toEqual([]);
  });
  it('tells a failing test run from a stats run that collected nothing', () => {
    expect(failedOnProjectTests('failed to collect stats. runner returned 1')).toBe(true);
    expect(failedOnProjectTests('Failed to run clean test')).toBe(true);
    expect(failedOnProjectTests('failed to collect stats. runner returned 5')).toBe(false);
    expect(failedOnProjectTests('Segmentation fault')).toBe(false);
  });
});
