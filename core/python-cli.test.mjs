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
import { installFakeToolchain } from '../languages/python/adapters/fixtures/fake-toolchain.mjs';
import { jscpdVersion } from '../languages/java/adapters/java-duplicates.mjs';
import { runCli } from './cli.mjs';

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

const FAILING_SUMMARY = [
  'Base: comparison-base (argument)',
  '',
  'Quality gate summary',
  '✖ 2 new enforceable violations',
  '  ruff/B006 src/demo/a.py:2',
  '    Do not use mutable data structures for argument defaults. Default to `None` and create the value inside the function, or use an immutable default such as a tuple. To allow it for some paths, add a "python.exceptions" entry for B006 in nitpicker.config.json.',
  '  ruff-format/format src/demo/a.py',
  '    File is not formatted with ruff (detected; set "python.formatter" if wrong)',
  'Full diagnostics: <path>',
  '',
].join('\n');

function summaryOf({ output }) {
  return output.out.replace(/Full diagnostics: .*/, 'Full diagnostics: <path>');
}

const CLONE_SOURCE = [
  'def order_total(lines, discount):',
  '    total = 0',
  '    for line in lines:',
  '        if line.price > 0 and line.quantity > 0:',
  '            total += line.price * line.quantity',
  '        else:',
  '            total -= discount',
  '    if total < 0 and discount > 0:',
  '        total = 0',
  '    return total',
  '',
].join('\n');

const BROKEN_CONTRACT = [
  'Layers BROKEN',
  '',
  'Contracts: 0 kept, 1 broken.',
  '',
  'Broken contracts',
  '----------------',
  '',
  'Layers',
  '------',
  '',
  'demo is not allowed to import demo.b:',
  '',
  '- demo.a -> demo.b (l.4)',
  '',
].join('\n');

function newFindings(result, rule) {
  return result.json('new-findings.json').filter((finding) => finding.rule === rule);
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
  it('passes when the change adds no finding and keeps the legacy one baselined', () => {
    const root = pythonRepository();
    write(root, { 'src/demo/a.py': 'import os\n\n\n\ndef value():\n    return 1\n' });
    commit(root, 'move only');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('summary.json').tools.map(({ name }) => name)).toEqual([
      'python',
      'mutation',
    ]);
    expect(result.json('summary.json').tools.map(({ version }) => version)).toEqual([
      `ruff@0.9.9;mypy@1.13.0;coverage@7.6.1;unittest;jscpd@${jscpdVersion()}`,
      'mutmut@3.8.0;pytest@8.3.1',
    ]);
  });

  it('fails on a new lint finding and a new unformatted file in every report format', () => {
    const root = pythonRepository();
    write(root, {
      'violations.txt': `${LEGACY_VIOLATION}B006|src/demo/a.py|Do not use mutable data structures for argument defaults\n`,
      'unformatted.txt': 'src/demo/a.py\n',
    });
    commit(root, 'add violations');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(summaryOf(result)).toBe(FAILING_SUMMARY);
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'ruff',
        rule: 'B006',
        path: 'src/demo/a.py',
        identity: 'fp:nitpicker/subject=Do not use mutable data structures for argument defaults',
        message:
          'Do not use mutable data structures for argument defaults. Default to `None` and create the value inside the function, or use an immutable default such as a tuple. To allow it for some paths, add a "python.exceptions" entry for B006 in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 2, column: 1 },
      },
      {
        tool: 'ruff-format',
        rule: 'format',
        path: 'src/demo/a.py',
        identity: 'format',
        message: 'File is not formatted with ruff (detected; set "python.formatter" if wrong)',
        classification: 'enforceable',
      },
    ]);
    const sarif = JSON.parse(readFileSync(path.join(result.reports, 'report.sarif'), 'utf8'));
    expect(sarif.runs[0].results.map(({ ruleId }) => ruleId)).toEqual([
      'ruff/B006',
      'ruff-format/format',
    ]);
    expect(readFileSync(path.join(result.reports, 'report.junit.xml'), 'utf8')).toMatch(/B006/);
  });

  it('fails on a type error, a one-way rule and an inline ignore, each naming the allowed form', () => {
    const root = pythonRepository();
    write(root, {
      'type-errors.txt':
        'src/demo/a.py:4: error: Incompatible return value type (got "int", expected "str")  [return-value]\n',
      'rules.json': JSON.stringify([
        { rule: 'frozen-dataclass', path: 'src/demo/a.py', subject: 'Order', line: 6 },
        { rule: 'no-inline-suppression', path: 'src/demo/a.py', subject: 'noqa', line: 7 },
      ]),
    });
    commit(root, 'add findings');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(
      result
        .json('new-findings.json')
        .map(({ tool, rule, identity, message }) => [`${tool}/${rule}`, identity, message]),
    ).toEqual([
      [
        'mypy/return-value',
        'Incompatible return value type (got "int", expected "str")',
        'Incompatible return value type (got "int", expected "str"). Fix the type; inline ignores are banned. To allow it for some paths, add a "python.exceptions" entry for return-value in nitpicker.config.json.',
      ],
      [
        'python-rules/frozen-dataclass',
        'Order',
        'Dataclass Order is not frozen. Declare records as `@dataclass(frozen=True)` and build a changed copy with `dataclasses.replace`. To allow it for some paths, add a "python.exceptions" entry for frozen-dataclass in nitpicker.config.json.',
      ],
      [
        'python-rules/no-inline-suppression',
        'noqa',
        'Inline suppression `# noqa`. Remove the comment and fix the code. If it must stay, add a "python.exceptions" entry for no-inline-suppression for this path.',
      ],
    ]);
  });

  it('lifts a rule for some paths with python.exceptions and lists the exception', () => {
    const root = pythonRepository();
    write(root, {
      'nitpicker.config.json': JSON.stringify({
        preset: 'python',
        python: {
          exceptions: [{ rule: 'T201', paths: ['scripts/**'], reason: 'command line scripts' }],
        },
      }),
      'violations.txt': `${LEGACY_VIOLATION}T201|scripts/run.py|\`print\` found\n`,
    });
    commit(root, 'print in a script');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('new-findings.json')).toEqual([]);
    expect(result.json('summary.json').configOverrides).toEqual([
      'preset: "python"',
      'exception: {"rule":"T201","paths":["scripts/**"],"reason":"command line scripts"}',
    ]);
  });

  it('keeps a rule that an exception for other paths does not lift', () => {
    const root = pythonRepository();
    write(root, {
      'nitpicker.config.json': JSON.stringify({
        preset: 'python',
        python: { exceptions: [{ rule: 'T201', paths: ['scripts/**'], reason: 'scripts' }] },
      }),
      'violations.txt': `${LEGACY_VIOLATION}T201|src/demo/a.py|\`print\` found\n`,
    });
    commit(root, 'print in the library');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('new-findings.json').map(({ rule, message }) => [rule, message])).toEqual([
      [
        'T201',
        '`print` found. Use `logging`: `logger = logging.getLogger(__name__)`, then `logger.info(...)`. To allow it for some paths, add a "python.exceptions" entry for T201 in nitpicker.config.json.',
      ],
    ]);
  });

  it('uses the type checker the project configures, pyright here', () => {
    const calls = callsLog();
    const root = pythonRepository({ 'pyrightconfig.json': '{}\n' });
    write(root, {
      'pyright.json': JSON.stringify({
        generalDiagnostics: [
          {
            file: 'src/demo/a.py',
            severity: 'error',
            message: 'Bad\n  detail',
            range: { start: { line: 3, character: 4 } },
            rule: 'reportReturnType',
          },
        ],
      }),
    });
    commit(root, 'a type error');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'pyright',
        rule: 'reportReturnType',
        path: 'src/demo/a.py',
        identity: 'Bad',
        message:
          'Bad. Fix the type; inline ignores are banned. To allow it for some paths, add a "python.exceptions" entry for reportReturnType in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 4, column: 5 },
      },
    ]);
    const typeCheckerRuns = calls().filter(({ args = [] }) => !args.includes('--version'));
    expect(typeCheckerRuns.some(({ tool }) => tool === 'pyright')).toBe(true);
    expect(typeCheckerRuns.some(({ tool }) => tool === 'mypy')).toBe(false);
  });

  it('reports a project without a type checker as a tool error', () => {
    const root = pythonRepository();
    const broken = temporaryRoot('nitpicker-python-broken-checkers-');
    for (const name of ['mypy', 'pyright', 'basedpyright']) {
      rmSync(path.join(root, '.venv/bin', name));
      writeFileSync(path.join(broken, name), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    }
    setEnvironment('PATH', `${broken}${path.delimiter}${process.env.PATH}`);
    write(root, { 'src/demo/b.py': 'x = 1\n' });
    commit(root, 'change');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(
      result.json('tool-errors.json').map(({ tool, rule, snapshot }) => [tool, rule, snapshot]),
    ).toEqual([
      ['python', 'types-failed', 'base'],
      ['python', 'types-failed', 'head'],
    ]);
  });

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

  it('reports a missing environment as a tool error', () => {
    const root = pythonRepository({
      'nitpicker.config.json':
        '{ "preset": "python", "python": { "environment": "no-such-venv" } }\n',
    });
    write(root, { 'src/demo/b.py': 'x = 1\n' });
    commit(root, 'change');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    const message = `No Python environment at ${path.join(root, 'no-such-venv')} (${path.join(root, 'no-such-venv/bin')} does not exist): create it, or set "python.environment"`;
    expect(
      result
        .json('tool-errors.json')
        .sort((a, b) => `${a.tool} ${a.snapshot}`.localeCompare(`${b.tool} ${b.snapshot}`)),
    ).toEqual(
      ['mutation', 'python'].flatMap((tool) =>
        ['base', 'head'].map((snapshot) => ({ tool, snapshot, message })),
      ),
    );
  });

  it('runs base sources, not the head ones, against the environment of the checkout', () => {
    const calls = callsLog();
    const root = pythonRepository();
    write(root, { 'src/demo/a.py': 'def value():\n    return 2\n' });
    commit(root, 'change behaviour');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    const testRuns = calls().filter(({ tool, args }) => tool === 'coverage' && args[0] === 'run');
    expect(testRuns).toHaveLength(2);
    const [first, second] = testRuns;
    expect(first.cwd).not.toBe(second.cwd);
    for (const testRun of testRuns) {
      expect(testRun.pythonPath.split(path.delimiter)[0]).toBe(path.join(testRun.cwd, 'src'));
      expect(testRun.cwd).not.toBe(root);
    }
  });

  describe('function structure and CRAP', () => {
    const metric = (name, parameters) => ({
      file: 'src/demo/a.py',
      name,
      start: 4,
      end: 5,
      lines: 2,
      statements: 1,
      maxControlNesting: 0,
      parameters,
    });
    const lizardRow = (name, ccn) =>
      `2,${ccn},9,0,2,"${name}@4-5@src/demo/a.py","src/demo/a.py","${name}","${name}( )",4,5\n`;
    const coverageOf = (...names) =>
      JSON.stringify({
        files: {
          'src/demo/a.py': {
            functions: Object.fromEntries(
              names.map((name) => [
                name,
                {
                  executed_lines: [],
                  missing_lines: [5],
                  summary: {
                    num_statements: 1,
                    covered_lines: 0,
                    num_branches: 0,
                    covered_branches: 0,
                  },
                },
              ]),
            ),
          },
        },
      });
    const enforceable = (result) =>
      result
        .json('new-findings.json')
        .filter(({ classification }) => classification === 'enforceable')
        .map(({ tool, rule, symbol, message }) => ({ tool, rule, symbol, message }));

    it('gates new structure and CRAP findings, and holds a touched legacy function at its limit unless it grows', () => {
      const root = pythonRepository({
        'structure-data.json': JSON.stringify([metric('value', 4)]),
      });
      write(root, {
        'src/demo/a.py': 'import os\n\n\ndef value():\n    return 2\n',
        'structure-data.json': JSON.stringify([metric('value', 4), metric('fresh', 4)]),
        'lizard-data.csv': lizardRow('value', 5) + lizardRow('ghost', 1),
        'coverage-data.json': coverageOf('value'),
      });
      commit(root, 'add new functions, touch the legacy one');
      const added = run(root);

      write(root, {
        'nitpicker.config.json': '{ "preset": "python", "thresholds": { "crapLimit": 40 } }\n',
        'structure-data.json': JSON.stringify([metric('value', 5)]),
        'lizard-data.csv': lizardRow('value', 5),
      });
      commit(root, 'raise the CRAP limit, grow the legacy function');
      const grown = run(root);

      expect(added.exitCode, added.text).toBe(1);
      expect(enforceable(added)).toEqual([
        {
          tool: 'crap',
          rule: 'crap-coverage-unknown',
          symbol: 'ghost',
          message:
            'ghost has unknown coverage and no CRAP score: no test runs it. Add a test that calls it; for inline composition-root wiring, move it to a named function in adapters/ and test that.',
        },
        {
          tool: 'crap',
          rule: 'crap-score-limit',
          symbol: 'value',
          message:
            'value has CRAP 30.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function.',
        },
        {
          tool: 'structure',
          rule: 'function-parameters-limit',
          symbol: 'fresh',
          message: 'fresh has 4 parameters; limit is 3',
        },
      ]);
      expect(grown.exitCode, grown.text).toBe(1);
      expect(enforceable(grown)).toEqual([
        {
          tool: 'structure',
          rule: 'function-parameters-limit',
          symbol: 'value',
          message:
            'value grew from 4 to 5 parameters (limit 3). Group related parameters into one object instead of adding another.',
        },
      ]);
    });
  });

  it('rejects the TypeScript-only config keys', () => {
    const root = pythonRepository({
      'nitpicker.config.json': '{ "preset": "python", "layout": { "sourceRoots": ["src"] } }\n',
    });

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.output.err).toMatch(
      /^nitpicker failed: nitpicker.config.json: "layout" is not supported with "preset": "python"/,
    );
  });

  it('fails on a new duplicate and keeps a moved legacy duplicate baselined', () => {
    const root = pythonRepository({ 'src/demo/a.py': CLONE_SOURCE });
    write(root, { 'src/demo/b.py': CLONE_SOURCE });
    commit(root, 'copy a module');

    const failed = run(root);

    expect(failed.exitCode, failed.text).toBe(1);
    expect(newFindings(failed, 'duplicate-clone')).toEqual([
      {
        tool: 'duplicates',
        rule: 'duplicate-clone',
        path: 'src/demo/a.py',
        identity: 'pair:src/demo/a.py|src/demo/b.py:fragment:8e33a9ff56a22a94c8efc96f:occurrence:1',
        message:
          'This code repeats src/demo/b.py:1 (10 lines). Keep one copy and call it from both places. If the repetition is intended, add src/demo/a.py to "exclude" in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 1 },
      },
    ]);

    const legacy = pythonRepository({
      'src/demo/a.py': CLONE_SOURCE,
      'src/demo/b.py': CLONE_SOURCE,
    });
    write(legacy, { 'src/demo/a.py': `import os\n\n\n${CLONE_SOURCE}` });
    commit(legacy, 'move the legacy duplicate');

    expect(run(legacy).exitCode).toBe(0);
  });

  it('fails when a new import makes a stable package depend on a less stable one', () => {
    const modules = Object.fromEntries(
      [
        'base/__init__',
        'base/core',
        'feature/__init__',
        'feature/a',
        'feature/b',
        'other/__init__',
        'other/o',
      ].map((name) => [`src/${name}.py`, '']),
    );
    const scan = (imports) => `${JSON.stringify(imports)}\n`;
    const from = (module, ...names) => ({ level: 0, module, names });
    const feature = {
      'src/feature/a.py': [from('base', 'core')],
      'src/feature/b.py': [from('base', 'core')],
      'src/other/o.py': [from('feature', 'a')],
    };
    const root = pythonRepository({ ...modules, 'import-scan.json': scan(feature) });
    expect(run(root).exitCode).toBe(0);
    write(root, {
      'import-scan.json': scan({ ...feature, 'src/base/core.py': [from('other', 'o')] }),
    });
    commit(root, 'depend on the volatile package');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(newFindings(result, 'stability-direction')).toEqual([
      {
        tool: 'coupling',
        rule: 'stability-direction',
        path: 'src/base/__init__.py',
        identity: 'package-edge:base->other',
        message:
          'base depends on less stable package other. Depend on an abstraction in a more stable package instead, or, if the inversion is intended, add src/base/__init__.py to "exclude" in nitpicker.config.json.',
        classification: 'enforceable',
      },
    ]);
  });

  it('fails on a new broken import-linter contract when the project has contracts', () => {
    const root = pythonRepository({
      '.importlinter': '[importlinter]\nroot_package = demo\n',
      'lint-imports.txt': 'Contracts: 1 kept, 0 broken.\n',
    });
    write(root, { 'lint-imports.txt': BROKEN_CONTRACT });
    commit(root, 'break the contract');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(newFindings(result, 'contract-broken')).toEqual([
      {
        tool: 'import-linter',
        rule: 'contract-broken',
        path: 'src/demo/a.py',
        identity: 'contract:Layers:demo.a -> demo.b',
        message:
          'Import contract "Layers" is broken: demo.a -> demo.b. Remove the import, or lift this file with exclude in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 4 },
      },
    ]);
  });

  it('skips import-linter when the config turns it off', () => {
    const root = pythonRepository({
      '.importlinter': '[importlinter]\nroot_package = demo\n',
      'nitpicker.config.json': '{ "preset": "python", "python": { "importLinter": false } }\n',
    });
    write(root, { 'lint-imports.txt': BROKEN_CONTRACT });
    commit(root, 'break the contract');

    expect(run(root).exitCode).toBe(0);
  });

  it('reports an import-linter run that checked nothing as a tool error', () => {
    const root = pythonRepository({ '.importlinter': '[importlinter]\nroot_package = demo\n' });
    write(root, { 'lint-imports.txt': 'Could not find .importlinter.\n' });
    commit(root, 'make the tool fail');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('tool-errors.json')).toEqual([
      {
        tool: 'python',
        snapshot: 'head',
        rule: 'import-linter-failed',
        path: '.',
        message: 'lint-imports could not check the contracts:\nCould not find .importlinter.',
      },
    ]);
  });

  it('gates a snapshot with --all', () => {
    const root = pythonRepository();
    const reports = path.join(temporaryRoot('nitpicker-python-snapshot-'), 'reports');
    const out = { text: '' };

    const exitCode = runCli({
      arguments_: ['--all', '--output', reports],
      environment: { NO_COLOR: '1' },
      currentProjectRoot: root,
      stdout: {
        write: (value) => {
          out.text += value;
        },
      },
      stderr: { write: () => undefined },
    });

    expect(exitCode).toBe(1);
    expect(out.text).toBe(
      [
        'Nitpicker quality snapshot',
        'Status: violations',
        'Enforceable findings: 1',
        'Descriptive findings: 12',
        'Tool errors: 0',
        '',
        'Per-tool counts:',
        'python: total=13 enforceable=1 descriptive=12',
        'mutation: total=0 enforceable=0 descriptive=0',
        '',
        'Enforceable findings:',
        'ruff/F401 src/demo/a.py:1 `os` imported but unused. To allow it for some paths, add a "python.exceptions" entry for F401 in nitpicker.config.json.',
        '',
        'Descriptive findings:',
        'coupling/coupling . dependencies summary',
        'coupling/coupling . modules summary',
        'coupling/coupling . packages summary',
        'coupling/package-coupling . connectedComponents for package demo',
        'coupling/package-coupling . fanIn for package demo',
        'coupling/package-coupling . fanOut for package demo',
        'coupling/package-coupling . internalEdges for package demo',
        'coupling/package-coupling . largestComponentShare for package demo',
        'coupling/package-coupling . modules for package demo',
        'coupling/module-coupling src/demo/a.py fanIn for src/demo/a.py',
        'coupling/module-coupling src/demo/a.py fanOut for src/demo/a.py',
        'coupling/module-coupling src/demo/a.py totalCoupling for src/demo/a.py',
        '',
      ].join('\n'),
    );
  });
});

describe('changed-branch-coverage with "preset": "python"', () => {
  const BRANCHY = [
    'import os',
    '',
    '',
    'def value(x):',
    '    if x:',
    '        return 1',
    '    return 2',
    '',
  ].join('\n');
  const coverageData = (executed, missing) =>
    JSON.stringify({
      files: { 'src/demo/a.py': { executed_branches: executed, missing_branches: missing } },
    });
  const GAP = coverageData([[5, 6]], [[5, 7]]);

  const branchyRepository = () =>
    pythonRepository({ 'src/demo/a.py': BRANCHY, 'coverage-data.json': GAP });

  const newBranchFindings = (result) =>
    result.json('new-findings.json').map(({ tool, rule, path: file, message, location }) => ({
      tool,
      rule,
      path: file,
      line: location?.line,
      message,
    }));

  it('fails an uncovered branch whose line the change touches', () => {
    const root = branchyRepository();
    write(root, { 'src/demo/a.py': BRANCHY.replace('if x:', 'if  x:') });
    commit(root, 'touch the branch line');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(newBranchFindings(result)).toEqual([
      {
        tool: 'coverage-py',
        rule: 'changed-branch-coverage',
        path: 'src/demo/a.py',
        line: 5,
        message:
          "Branch coverage is 50.00%; minimum is 95%. Not taken: the branch to line 7. Test it, or remove it if it can't happen. To exempt a file, add it to exclude in nitpicker.config.json.",
      },
    ]);
  });

  it('fails a new branch that no test takes and passes once a test covers it', () => {
    const root = branchyRepository();
    write(root, {
      'src/demo/a.py': `${BRANCHY}\n\ndef sign(y):\n    if y < 0:\n        return -1\n    return 1\n`,
      'coverage-data.json': coverageData(
        [[5, 6]],
        [
          [5, 7],
          [11, 12],
          [11, 13],
        ],
      ),
    });
    commit(root, 'add an untested branch');

    const failing = run(root);

    expect(failing.exitCode, failing.text).toBe(1);
    expect(newBranchFindings(failing).map(({ line }) => line)).toEqual([11]);

    write(root, {
      'coverage-data.json': coverageData(
        [
          [5, 6],
          [11, 12],
          [11, 13],
        ],
        [[5, 7]],
      ),
    });
    commit(root, 'test it');

    expect(run(root).exitCode).toBe(0);
  });
});
