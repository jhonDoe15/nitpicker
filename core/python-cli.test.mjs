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
import {
  installFakePoetry,
  installFakeToolchain,
  installFakeUv,
} from '../languages/python/adapters/fixtures/fake-toolchain.mjs';
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
  '    Do not use mutable data structures for argument defaults',
  '  ruff-format/format src/demo/a.py',
  '    File is not formatted with ruff',
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

describe('nitpicker with "preset": "python"', () => {
  it('passes when the change adds no finding and keeps the legacy one baselined', () => {
    const root = pythonRepository();
    write(root, { 'src/demo/a.py': 'import os\n\n\n\ndef value():\n    return 1\n' });
    commit(root, 'move only');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('summary.json').tools.map(({ name }) => name)).toEqual(['python']);
    expect(result.json('summary.json').tools[0].version).toBe(
      `ruff@0.9.9;coverage@7.6.1;pytest@8.3.1;jscpd@${jscpdVersion()}`,
    );
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
      expect.objectContaining({
        tool: 'ruff',
        rule: 'B006',
        path: 'src/demo/a.py',
        classification: 'enforceable',
      }),
      expect.objectContaining({
        tool: 'ruff-format',
        rule: 'format',
        path: 'src/demo/a.py',
        message: 'File is not formatted with ruff',
      }),
    ]);
    const sarif = JSON.parse(readFileSync(path.join(result.reports, 'report.sarif'), 'utf8'));
    expect(sarif.runs[0].results.map(({ ruleId }) => ruleId)).toEqual([
      'ruff/B006',
      'ruff-format/format',
    ]);
    expect(readFileSync(path.join(result.reports, 'report.junit.xml'), 'utf8')).toMatch(/B006/);
  });

  it('checks formatting with black when the project uses it', () => {
    const root = pythonRepository({
      'pyproject.toml': '[tool.black]\nline-length = 100\n',
    });
    write(root, { 'unformatted.txt': 'src/demo/a.py\n' });
    commit(root, 'unformatted file');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      expect.objectContaining({
        tool: 'black',
        rule: 'format',
        path: 'src/demo/a.py',
        message: 'File is not formatted with black',
      }),
    ]);
    expect(result.json('summary.json').tools[0].version).toBe(
      `ruff@0.9.9;black@24.1.0;coverage@7.6.1;pytest@8.3.1;jscpd@${jscpdVersion()}`,
    );
  });

  it('honours exclude from nitpicker.config.json', () => {
    const root = pythonRepository();
    write(root, {
      'nitpicker.config.json': '{ "preset": "python", "exclude": ["src/demo/**"] }\n',
      'violations.txt': `${LEGACY_VIOLATION}B006|src/demo/a.py|mutable default\n`,
    });
    commit(root, 'add a violation in an excluded path');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('new-findings.json')).toEqual([]);
  });

  it('baselines a site from the legacy inventory and fails on baseline-expansion', () => {
    const site = (count) => ({
      sites: [
        {
          file: 'src/demo/a.py',
          rule: 'B006',
          source: 'fp:nitpicker/subject=mutable default',
          count,
        },
      ],
    });
    const root = pythonRepository({ 'nitpicker.legacy.json': JSON.stringify(site(1)) });
    write(root, { 'violations.txt': `${LEGACY_VIOLATION}B006|src/demo/a.py|mutable default\n` });
    commit(root, 'add a baselined violation');
    expect(run(root).exitCode).toBe(0);

    write(root, { 'nitpicker.legacy.json': JSON.stringify(site(2)) });
    commit(root, 'raise the allowance');
    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      expect.objectContaining({
        tool: 'python',
        rule: 'baseline-expansion',
        message: 'Legacy allowance increased from 1 to 2 for B006',
      }),
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
      expect.objectContaining({
        tool: 'python',
        snapshot: 'head',
        rule: 'tests-failed',
        message: expect.stringContaining('1 failed: test_greet'),
      }),
    ]);
  });

  it('reports a crashing tool on base as a tool error', () => {
    const root = pythonRepository({ 'fail.json': '{ "ruff": "ruff crashed" }\n' });
    write(root, { 'fail.json': '{}\n' });
    commit(root, 'fix the tool');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    const errors = result.json('tool-errors.json');
    expect(errors.map(({ rule }) => rule).sort()).toEqual(['format-failed', 'ruff-failed']);
    expect(errors).toEqual(
      Array(2).fill(
        expect.objectContaining({
          tool: 'python',
          snapshot: 'base',
          message: expect.stringContaining('ruff crashed'),
        }),
      ),
    );
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
    const errors = result.json('tool-errors.json');
    expect(errors.map(({ snapshot }) => snapshot).sort()).toEqual(['base', 'head']);
    expect(errors).toEqual(
      Array(2).fill(
        expect.objectContaining({
          tool: 'python',
          message: expect.stringMatching(/^No Python environment at .*no-such-venv/),
        }),
      ),
    );
  });

  it('runs every tool through uv when the project has a uv.lock', () => {
    const tools = temporaryRoot('nitpicker-python-uv-');
    installFakeUv(tools);
    const uvLog = path.join(tools, 'uv.log');
    setEnvironment('FAKE_UV_LOG', uvLog);
    setEnvironment('PATH', `${tools}${path.delimiter}${process.env.PATH}`);
    const root = pythonRepository({ 'uv.lock': 'version = 1\n' });
    write(root, { 'src/demo/b.py': 'x = 1\n' });
    commit(root, 'change');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    const invocations = readFileSync(uvLog, 'utf8').split('\n').filter(Boolean);
    expect(invocations[0]).toBe(`run --project ${root} --no-sync -- ruff --version`);
    expect(invocations.filter((line) => line.includes('-- coverage run'))).toHaveLength(2);
  });

  it('runs every tool in the poetry environment when the project has a poetry.lock', () => {
    const tools = temporaryRoot('nitpicker-python-poetry-');
    const root = pythonRepository({ 'poetry.lock': '# lock\n' });
    installFakePoetry(tools, path.join(root, '.venv'));
    setEnvironment('PATH', `${tools}${path.delimiter}${process.env.PATH}`);
    write(root, { 'src/demo/b.py': 'x = 1\n' });
    commit(root, 'change');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
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

  it('falls back to unittest when pytest is not installed', () => {
    const calls = callsLog();
    const root = pythonRepository({ 'no-pytest.txt': '\n', 'tests/test_a.py': 'x = 1\n' });
    write(root, { 'src/demo/b.py': 'x = 1\n' });
    commit(root, 'change');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    const testRun = calls().find(({ tool, args }) => tool === 'coverage' && args[0] === 'run');
    expect(testRun.args.slice(-5)).toEqual(['-m', 'unittest', 'discover', '-s', 'tests']);
    expect(result.json('summary.json').tools[0].version).toMatch(/;unittest;jscpd@/);
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
      expect.objectContaining({
        tool: 'duplicates',
        path: 'src/demo/a.py',
        classification: 'enforceable',
        message: expect.stringContaining('This code repeats src/demo/b.py'),
      }),
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
      expect.objectContaining({
        tool: 'coupling',
        path: '.',
        identity: 'package-edge:base->other',
        message: 'base depends on less stable package other',
      }),
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
      expect.objectContaining({
        tool: 'import-linter',
        path: 'src/demo/a.py',
        identity: 'contract:Layers:demo.a -> demo.b',
        location: { line: 4 },
      }),
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
      expect.objectContaining({
        tool: 'python',
        snapshot: 'head',
        rule: 'import-linter-failed',
        message: expect.stringContaining('Could not find .importlinter.'),
      }),
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
        '',
        'Enforceable findings:',
        'ruff/F401 src/demo/a.py:1 `os` imported but unused',
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
