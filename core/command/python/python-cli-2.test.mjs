import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { installFakeToolchain } from '../../../languages/python/adapters/fixtures/fake-toolchain.mjs';
import { runCli } from '../../cli.mjs';

const temporaryRoots = [];

const savedEnvironment = {};

function setEnvironment(name, value) {
  savedEnvironment[name] ??= { value: process.env[name] };
  process.env[name] = value;
}

function temporaryRoot(prefix) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const [name, { value }] of Object.entries(savedEnvironment)) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, name);
    } else {
      process.env[name] = value;
    }
    Reflect.deleteProperty(savedEnvironment, name);
  }
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const gitEnvironment = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: gitEnvironment });
}

function write(root, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
}

function commit(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
}

const LEGACY_VIOLATION = 'F401|src/demo/a.py|`os` imported but unused\n';

let templateRoot;

beforeAll(() => {
  templateRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-template-')));
  git(templateRoot, ['init', '-q', '--initial-branch=main']);
  git(templateRoot, ['config', 'user.name', 'Nitpicker Python Fixture']);
  git(templateRoot, ['config', 'user.email', 'nitpicker-python@example.invalid']);
  write(templateRoot, {
    'nitpicker.config.json': '{ "preset": "python" }\n',
    '.gitignore': '.venv/\n',
    'pyproject.toml': '[project]\nname = "demo"\nversion = "0.1.0"\n',
    'src/demo/a.py': 'import os\n\n\ndef value():\n    return 1\n',
    'violations.txt': LEGACY_VIOLATION,
  });
  installFakeToolchain(path.join(templateRoot, '.venv/bin'));
  commit(templateRoot, 'base');
  git(templateRoot, ['branch', 'comparison-base']);
});

afterAll(() => {
  rmSync(templateRoot, { recursive: true, force: true });
});

function pythonRepository(files = {}) {
  const root = temporaryRoot('nitpicker-python-cli-');
  cpSync(templateRoot, root, { recursive: true });
  if (Object.keys(files).length > 0) {
    write(root, files);
    commit(root, 'base');
    git(root, ['branch', '-f', 'comparison-base']);
  }
  return root;
}

function run(root, extra = []) {
  const output = { out: '', err: '' };
  const reports = path.join(temporaryRoot('nitpicker-python-out-'), 'reports');
  const exitCode = runCli({
    arguments_: ['--base', 'comparison-base', '--output', reports, ...extra],
    environment: { NO_COLOR: '1' },
    currentProjectRoot: root,
    stdout: {
      write: (value) => {
        output.out += value;
      },
    },
    stderr: {
      write: (value) => {
        output.err += value;
      },
    },
    progress: { write: () => undefined },
  });
  const json = (name) => JSON.parse(readFileSync(path.join(reports, name), 'utf8'));
  return { exitCode, reports, json, output, text: output.out + output.err };
}

function callsLog() {
  const log = path.join(temporaryRoot('nitpicker-python-log-'), 'calls.jsonl');
  writeFileSync(log, '');
  setEnvironment('FAKE_PYTHON_LOG', log);
  return () =>
    readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
}

const mutantFindings = (result) =>
  result.json('new-findings.json').filter(({ rule }) => rule !== 'mutation-summary');

describe('nitpicker with "preset": "python"', () => {
  it('fails a change that leaves the project without any test', () => {
    const root = pythonRepository();
    write(root, { 'test-exit.txt': '5\n' });
    commit(root, 'delete the tests');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'python',
        rule: 'no-tests-ran',
        path: '.',
        identity: 'no-tests-ran',
        message: 'No tests ran. Keep the project tests, or restore the ones this change removed.',
        classification: 'enforceable',
      },
    ]);
  });
  describe('mutation testing', () => {
    const MUTATED_VALUE =
      'def x_value__mutmut_orig():\n    return 1\n\n\ndef x_value__mutmut_1():\n    return 2\n\n\ndef x_value__mutmut_2():\n    return 3\n';
    const mutants = (exitCodes) =>
      JSON.stringify({
        'src/demo/a.py': {
          exitCodes: Object.fromEntries(
            exitCodes.map((code, index) => [`demo.a.x_value__mutmut_${String(index + 1)}`, code]),
          ),
          mutated: MUTATED_VALUE,
        },
      });
    it('fails a new surviving mutant and reports it with the function and the change', () => {
      const root = pythonRepository({ 'mutants-data.json': mutants([1]) });
      write(root, { 'mutants-data.json': mutants([1, 0]) });
      commit(root, 'a mutant survives');

      const result = run(root);

      expect(result.exitCode, result.text).toBe(1);
      expect(mutantFindings(result)).toEqual([
        {
          tool: 'mutmut',
          rule: 'mutant-survived',
          path: 'src/demo/a.py',
          identity: 'value|1→3#1',
          message:
            'Survived number: replacing `1` with `3` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
          classification: 'enforceable',
          symbol: 'value',
          location: { line: 5 },
        },
      ]);
    });
    it('fails a new mutant that no test reaches', () => {
      const root = pythonRepository({ 'mutants-data.json': mutants([1]) });
      write(root, { 'mutants-data.json': mutants([1, 33]) });
      commit(root, 'a mutant is not covered');

      const result = run(root);

      expect(result.exitCode, result.text).toBe(1);
      expect(mutantFindings(result)).toEqual([
        {
          tool: 'mutmut',
          rule: 'mutant-nocoverage',
          path: 'src/demo/a.py',
          identity: 'value|1→3#1',
          message: 'NoCoverage number: no test runs this code. Add a test that reaches it.',
          classification: 'enforceable',
          symbol: 'value',
          location: { line: 5 },
        },
      ]);
    });
    it('does not fail the survivor the base already had, even when its line moves', () => {
      const root = pythonRepository({ 'mutants-data.json': mutants([0]) });
      write(root, { 'src/demo/a.py': 'import os\n\n\n\ndef value():\n    return 1\n' });
      commit(root, 'move the function');

      const result = run(root);

      expect(result.exitCode, result.text).toBe(0);
      expect(mutantFindings(result)).toEqual([]);
    });
    it('lists the mutants that are neither killed, survived nor uncovered without failing', () => {
      const root = pythonRepository({ 'mutants-data.json': mutants([1]) });
      write(root, { 'mutants-data.json': mutants([36]) });
      commit(root, 'a mutant times out');

      const result = run(root);

      expect(result.exitCode, result.text).toBe(0);
      expect(mutantFindings(result)).toEqual([
        {
          tool: 'mutmut',
          rule: 'mutant-timeout',
          path: 'src/demo/a.py',
          identity: 'value|1→2#1',
          message: 'Timeout number',
          classification: 'descriptive',
          symbol: 'value',
          location: { line: 5 },
        },
      ]);
    });
    it.each([
      ['an unrelated source was added', { 'src/demo/b.py': 'x = 1\n' }, ['src/demo/a.py.meta']],
      ['the source itself changed', { 'src/demo/a.py': 'def value():\n    return 3\n' }, []],
      [
        'a module it imports changed',
        {
          'import-scan.json': '{"src/demo/a.py":[{"level":0,"module":"demo","names":["b"]}]}',
          'src/demo/b.py': 'y = 1\n',
        },
        [],
      ],
      ['a test changed too', { 'tests/test_a.py': 'x = 2\n', 'src/demo/b.py': 'x = 1\n' }, []],
    ])('reuses the base results of the untouched modules on head when %s', (_, changes, reused) => {
      const calls = callsLog();
      const root = pythonRepository({
        'mutants-data.json': mutants([0]),
        'tests/test_a.py': 'x = 1\n',
      });
      write(root, changes);
      commit(root, 'change');

      const result = run(root);

      expect(result.exitCode, result.text).toBe(0);
      const seeded = calls()
        .filter(({ tool }) => tool === 'mutmut-seeded')
        .map(({ seeded: files }) => files);
      expect(seeded).toEqual([[], reused]);
    });
    it('keeps the lint and format findings when mutmut is missing, and says how to disable mutation', () => {
      const root = pythonRepository({ 'no-mutmut.txt': '' });
      write(root, { 'violations.txt': `${LEGACY_VIOLATION}B006|src/demo/a.py|Mutable default\n` });
      commit(root, 'a new violation');

      const result = run(root);

      expect(result.exitCode, result.text).toBe(1);
      expect(result.json('new-findings.json').map(({ rule }) => rule)).toEqual(['B006']);
      const missing = (snapshot) => ({
        tool: 'mutation',
        snapshot,
        rule: 'mutation-failed',
        path: '.',
        message:
          'mutmut was not found in the virtualenv environment: install it there (for example as a dev dependency), or set "python.environment" to the environment that has it. To run without mutation testing, add "mutation" to "disable" in nitpicker.config.json.',
      });
      expect(result.json('tool-errors.json')).toEqual([missing('base'), missing('head')]);
    });
    it('does not run mutmut when mutation is disabled', () => {
      const calls = callsLog();
      const root = pythonRepository({
        'nitpicker.config.json': '{ "preset": "python", "disable": ["mutation"] }\n',
        'no-mutmut.txt': '',
      });
      write(root, { 'src/demo/b.py': 'x = 1\n' });
      commit(root, 'change');

      const result = run(root);

      expect(result.exitCode, result.text).toBe(0);
      expect(result.json('summary.json').tools.map(({ name }) => name)).toEqual(['python']);
      expect(calls().filter(({ tool }) => tool === 'mutmut')).toEqual([]);
    });
    it('does not run mutmut when the tests fail, and the tests-failed error is the only one', () => {
      const calls = callsLog();
      const root = pythonRepository();
      write(root, { 'test-exit.txt': '1\n' });
      commit(root, 'break the tests');

      const result = run(root);

      expect(result.exitCode).toBe(2);
      expect(result.json('tool-errors.json').map(({ rule }) => rule)).toEqual(['tests-failed']);
      expect(calls().filter(({ tool }) => tool === 'mutmut')).toHaveLength(1);
    });
    it('reports a failing mutmut run as a tool error on head', () => {
      const root = pythonRepository();
      write(root, { 'mutmut-exit.txt': '2\n' });
      commit(root, 'break mutmut');

      const result = run(root);

      expect(result.exitCode).toBe(2);
      expect(result.json('tool-errors.json')).toEqual([
        {
          tool: 'mutation',
          snapshot: 'head',
          rule: 'mutation-failed',
          path: '.',
          message: 'mutmut run exited 2 in the virtualenv environment:\nFailed to run clean test',
        },
      ]);
    });
  });
  it('reports a failing test run on head as a tool error with exit 2 instead of throwing', () => {
    const root = pythonRepository();
    write(root, { 'test-exit.txt': '1\n' });
    commit(root, 'break the tests');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.output.err).toBe('');
    expect(result.json('summary.json').overallStatus).toBe('tool-error');
    expect(result.json('tool-errors.json')).toEqual([
      {
        tool: 'python',
        snapshot: 'head',
        rule: 'tests-failed',
        path: '.',
        message: 'coverage run exited 1 in the virtualenv environment:\n1 failed: test_greet',
      },
    ]);
  });
});
