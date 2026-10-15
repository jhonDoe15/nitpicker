import { cpSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  commitBranch,
  fixture,
  gate,
  git,
  installPackages,
  pythonE2eEnabled,
} from './test-support/python-e2e-support.mjs';

// End-to-end test of a change that repairs a base whose tests fail, with real tools. It needs
// python3, uv and network access to PyPI, so it only runs with NITPICKER_PYTHON_E2E=1
// (`npm run test:python`).

const TEST_PATH = 'tests/test_greeter.py';
const FAILING_TEST =
  'from demo.greeter import greet\n\n\ndef test_greet():\n    assert greet("Ada") == "Hi, Ada!"\n';
const PASSING_TEST = FAILING_TEST.replace('Hi, Ada!', 'Hello, Ada!');
const VIOLATION = 'import sys\n\n\ndef f( a,b ):\n    return a+b\n';
const LEGACY_EDIT = 'import os\n\n\ndef value():\n    return 1 + 0\n';

const enforceable = (result) =>
  result
    .json('new-findings.json')
    .filter(({ classification }) => classification === 'enforceable')
    .map(({ tool, rule }) => `${tool} ${rule}`)
    .sort();

describe.skipIf(!pythonE2eEnabled)('Python preset on a base whose tests fail', () => {
  let project;

  beforeAll(() => {
    project = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-red-base-')));
    cpSync(fixture, project, { recursive: true });
    git(project, 'init', '-q', '-b', 'main');
    git(project, 'add', '-A');
    git(project, 'commit', '-q', '-m', 'main');
    installPackages(project, ['-e', '.', 'coverage', 'mutmut', 'pytest', 'mypy']);
    commitBranch(project, 'red-base', { [TEST_PATH]: FAILING_TEST });
    commitBranch(project, 'repaired', { [TEST_PATH]: PASSING_TEST }, 'red-base');
    commitBranch(project, 'repaired-with-violation', { 'src/demo/bad.py': VIOLATION }, 'repaired');
    commitBranch(project, 'still-red', { 'src/demo/extra.py': 'EXTRA = 1\n' }, 'red-base');
    commitBranch(
      project,
      'repaired-legacy-edit',
      { 'src/demo/legacy.py': LEGACY_EDIT },
      'repaired',
    );
  });

  afterAll(() => {
    rmSync(project, { recursive: true, force: true });
  });

  it('passes a change that repairs the tests, with the failing base as a note and the untested legacy code unchanged', () => {
    const result = gate(project, 'repaired', [], 'red-base');

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('tool-errors.json')).toEqual([]);
    expect(enforceable(result)).toEqual([]);
    expect(result.json('notes.json')).toEqual([
      {
        tool: 'python',
        snapshot: 'base',
        rule: 'tests-failed',
        path: '.',
        message: expect.stringMatching(
          /^coverage run exited 1 in the virtualenv environment:\n[\s\S]*assert 'Hello, Ada!' == 'Hi, Ada!'[\s\S]*1 failed in [\d.]+s$/,
        ),
      },
    ]);
  });

  it('still fails a new violation next to a failing base', () => {
    const result = gate(project, 'repaired-with-violation', [], 'red-base');

    expect(result.exitCode, result.text).toBe(1);
    expect(enforceable(result)).toEqual([
      'mutmut mutant-nocoverage',
      'mypy no-untyped-def',
      'ruff F401',
      'ruff-format format',
    ]);
  });

  it('fails the untested lines of an edited legacy function', () => {
    const result = gate(project, 'repaired-legacy-edit', [], 'red-base');

    expect(result.exitCode, result.text).toBe(1);
    expect(enforceable(result)).toEqual(Array(3).fill('mutmut mutant-nocoverage'));
  });

  it('still fails when the head fails its tests too', () => {
    const result = gate(project, 'still-red', [], 'red-base');

    expect(result.exitCode, result.text).toBe(2);
    expect(result.json('notes.json')).toEqual([]);
    expect(
      result.json('tool-errors.json').map(({ snapshot, rule }) => `${snapshot} ${rule}`),
    ).toEqual(['base tests-failed', 'head tests-failed']);
  });
});
