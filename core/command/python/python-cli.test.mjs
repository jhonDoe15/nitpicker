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
import { jscpdVersion } from '../../../languages/java/adapters/metrics/java-duplicates.mjs';
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
    rmSync(path.join(root, '.venv/bin/mypy'));
    rmSync(path.join(root, '.venv/bin/pyright'));
    const broken = temporaryRoot('nitpicker-python-broken-checkers-');
    for (const name of ['mypy', 'pyright']) {
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
});
