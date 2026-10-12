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
  '    Do not use mutable data structures for argument defaults',
  '  ruff-format/format src/demo/a.py',
  '    File is not formatted with ruff (detected; set "python.formatter" if wrong)',
  'Full diagnostics: <path>',
  '',
].join('\n');

function summaryOf({ output }) {
  return output.out.replace(/Full diagnostics: .*/, 'Full diagnostics: <path>');
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

describe('nitpicker with "preset": "python"', () => {
  it('passes when the change adds no finding and keeps the legacy one baselined', () => {
    const root = pythonRepository();
    write(root, { 'src/demo/a.py': 'import os\n\n\n\ndef value():\n    return 1\n' });
    commit(root, 'move only');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('summary.json').tools.map(({ name }) => name)).toEqual(['python']);
    expect(result.json('summary.json').tools[0].version).toBe('ruff@0.9.9;coverage@7.6.1;unittest');
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
        message: 'Do not use mutable data structures for argument defaults',
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
    expect(result.json('tool-errors.json')).toEqual([
      { tool: 'python', snapshot: 'base', message },
      { tool: 'python', snapshot: 'head', message },
    ]);
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
    const VALUE = { file: 'src/demo/a.py', name: 'value', start: 4, end: 5 };
    const structureOf = (metrics) =>
      JSON.stringify([{ ...VALUE, lines: 2, statements: 1, maxControlNesting: 0, ...metrics }]);
    const LIZARD_ROW = (ccn) =>
      `2,${ccn},9,0,2,"value@4-5@src/demo/a.py","src/demo/a.py","value","value( )",4,5\n`;
    const COVERAGE = (covered) =>
      JSON.stringify({
        files: {
          'src/demo/a.py': {
            summary: { num_statements: 1, covered_lines: covered },
            functions: {
              value: {
                executed_lines: covered === 0 ? [] : [5],
                missing_lines: covered === 0 ? [5] : [],
                summary: {
                  num_statements: 1,
                  covered_lines: covered,
                  num_branches: 0,
                  covered_branches: 0,
                },
              },
            },
          },
        },
      });

    it('fails a new function over a structure limit with the shared rule and message', () => {
      const root = pythonRepository();
      write(root, { 'structure-data.json': structureOf({ parameters: 4 }) });
      commit(root, 'add a function with four parameters');

      const result = run(root);

      expect(result.exitCode, result.text).toBe(1);
      expect(result.json('new-findings.json')).toEqual([
        {
          tool: 'structure',
          rule: 'function-parameters-limit',
          path: 'src/demo/a.py',
          symbol: 'value',
          identity: expect.any(String),
          message: 'value has 4 parameters; limit is 3',
          classification: 'enforceable',
          location: { line: 4 },
          ratchet: {
            key: 'function:value:occurrence:1:parameters',
            value: 4,
            worseMessage:
              'value grew from {base} to 4 parameters (limit 3). Group related parameters into one object instead of adding another.',
            heldMessage:
              'value: 4 parameters (limit 3), allowed because base was {base}; any increase fails.',
          },
        },
      ]);
    });

    it('lets a touched legacy function stay over its limit unless the change makes it worse', () => {
      const root = pythonRepository({ 'structure-data.json': structureOf({ parameters: 4 }) });
      write(root, { 'src/demo/a.py': 'import os\n\n\ndef value():\n    return 2\n' });
      commit(root, 'edit the legacy function');
      const untouched = run(root);

      write(root, { 'structure-data.json': structureOf({ parameters: 5 }) });
      commit(root, 'add another parameter');
      const worse = run(root);

      expect(untouched.exitCode, untouched.text).toBe(0);
      expect(worse.exitCode, worse.text).toBe(1);
      expect(worse.json('new-findings.json')).toEqual([
        {
          tool: 'structure',
          rule: 'function-parameters-limit',
          path: 'src/demo/a.py',
          symbol: 'value',
          identity: expect.any(String),
          message:
            'value grew from 4 to 5 parameters (limit 3). Group related parameters into one object instead of adding another.',
          classification: 'enforceable',
          location: { line: 4 },
          ratchet: {
            key: 'function:value:occurrence:1:parameters',
            value: 5,
            worseMessage:
              'value grew from {base} to 5 parameters (limit 3). Group related parameters into one object instead of adding another.',
            heldMessage:
              'value: 5 parameters (limit 3), allowed because base was {base}; any increase fails.',
          },
        },
      ]);
    });

    it('fails a new untested complex function and passes it once it is covered', () => {
      const root = pythonRepository();
      write(root, { 'lizard-data.csv': LIZARD_ROW(5), 'coverage-data.json': COVERAGE(0) });
      commit(root, 'add a complex function without tests');
      const untested = run(root);

      write(root, { 'coverage-data.json': COVERAGE(1) });
      commit(root, 'test it');
      const tested = run(root);

      expect(untested.exitCode, untested.text).toBe(1);
      expect(
        untested
          .json('new-findings.json')
          .filter(({ classification }) => classification === 'enforceable'),
      ).toEqual([
        {
          tool: 'crap',
          rule: 'crap-score-limit',
          path: 'src/demo/a.py',
          symbol: 'value',
          identity: expect.any(String),
          message:
            'value has CRAP 30.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function.',
          classification: 'enforceable',
          location: { line: 4 },
          ratchet: {
            key: 'function:value:crap',
            value: 30,
            worseMessage:
              'value CRAP rose from {base} to 30 (limit 9). Put new code in a new function and cover it with tests.',
            heldMessage:
              'value: CRAP 30.00 (limit 9), allowed because base was {base}; any increase fails.',
          },
        },
      ]);
      expect(tested.exitCode, tested.text).toBe(0);
    });

    it('fails a function whose coverage is unknown', () => {
      const root = pythonRepository();
      write(root, { 'lizard-data.csv': LIZARD_ROW(1) });
      commit(root, 'add a function the coverage report does not know');

      const result = run(root);

      expect(result.exitCode, result.text).toBe(1);
      expect(result.json('new-findings.json')).toEqual([
        {
          tool: 'crap',
          rule: 'crap-coverage-unknown',
          path: 'src/demo/a.py',
          symbol: 'value',
          identity: 'function:value',
          message:
            'value has unknown coverage and no CRAP score: no test runs it. Add a test that calls it; for inline composition-root wiring, move it to a named function in adapters/ and test that.',
          classification: 'enforceable',
          location: { line: 4 },
        },
      ]);
    });

    it('takes the CRAP limit from thresholds.crapLimit', () => {
      const root = pythonRepository({
        'nitpicker.config.json': '{ "preset": "python", "thresholds": { "crapLimit": 40 } }\n',
      });
      write(root, { 'lizard-data.csv': LIZARD_ROW(5), 'coverage-data.json': COVERAGE(0) });
      commit(root, 'add a complex function without tests');

      const result = run(root);

      expect(result.exitCode, result.text).toBe(0);
    });

    it('reports a failing lizard as a tool error', () => {
      const root = pythonRepository({ 'fail.json': '{ "lizard": "lizard exploded" }\n' });
      write(root, { 'src/demo/b.py': 'x = 1\n' });
      commit(root, 'change');

      const result = run(root);

      expect(result.exitCode).toBe(2);
      expect(result.json('tool-errors.json')).toEqual([
        {
          tool: 'python',
          rule: 'lizard-failed',
          path: '.',
          snapshot: 'base',
          message: 'lizard exited 2 in the virtualenv environment:\nlizard exploded',
        },
        {
          tool: 'python',
          rule: 'lizard-failed',
          path: '.',
          snapshot: 'head',
          message: 'lizard exited 2 in the virtualenv environment:\nlizard exploded',
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
        'Descriptive findings: 0',
        'Tool errors: 0',
        '',
        'Per-tool counts:',
        'python: total=1 enforceable=1 descriptive=0',
        '',
        'Enforceable findings:',
        'ruff/F401 src/demo/a.py:1 `os` imported but unused',
        '',
      ].join('\n'),
    );
  });
});
