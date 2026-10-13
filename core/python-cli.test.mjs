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
  '    Do not use mutable data structures for argument defaults',
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

describe('nitpicker with "preset": "python"', () => {
  it('passes when the change adds no finding and keeps the legacy one baselined', () => {
    const root = pythonRepository();
    write(root, { 'src/demo/a.py': 'import os\n\n\n\ndef value():\n    return 1\n' });
    commit(root, 'move only');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('summary.json').tools.map(({ name }) => name)).toEqual(['python']);
    expect(result.json('summary.json').tools[0].version).toBe(
      `ruff@0.9.9;coverage@7.6.1;unittest;jscpd@${jscpdVersion()}`,
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
