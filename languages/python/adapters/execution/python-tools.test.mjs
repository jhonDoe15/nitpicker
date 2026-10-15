import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installFakeToolchain } from '../fixtures/fake-toolchain.mjs';
import {
  createToolContext,
  onlyUnparsableFiles,
  runPythonTools,
  unformattedPaths,
} from './python-tools.mjs';

const roots = [];

const savedEnvironment = new Map();

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-tools-')));
  roots.push(root);
  return root;
}

function coverageRc(...sources) {
  return [
    '[run]',
    'branch = True',
    'parallel = False',
    'source =',
    ...sources.map((source) => `    ${source}`),
    'omit =',
    '    test_*.py',
    '    *_test.py',
    '    conftest.py',
    '    */tests/*',
    '    */test/*',
    '[report]',
    'exclude_lines =',
    String.raw`    ^\s*if (typing\.)?TYPE_CHECKING:`,
    String.raw`    ^\s*if __name__ == .__main__.:`,
    String.raw`    ^\s*@(typing\.)?overload\b`,
    String.raw`    ^\s*raise NotImplementedError\b`,
    'partial_branches =',
    '',
  ].join('\n');
}

function setEnvironment(name, value) {
  if (!savedEnvironment.has(name)) {
    savedEnvironment.set(name, process.env[name]);
  }
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  for (const [name, value] of savedEnvironment) {
    setEnvironment(name, value);
  }
  savedEnvironment.clear();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files = {}, { tools } = {}) {
  const root = temporaryRoot();
  installFakeToolchain(path.join(root, '.venv/bin'), tools);
  mkdirSync(path.join(root, 'src/demo'), { recursive: true });
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), contents);
  }
  return root;
}

function contextFor(root, settings = {}, exclude = []) {
  const reportRoot = temporaryRoot();
  return {
    context: createToolContext({
      projectRoot: root,
      liveRoot: root,
      settings,
      reportRoot,
      exclude,
    }),
    reportRoot,
  };
}

function callsLog() {
  const log = path.join(temporaryRoot(), 'calls.jsonl');
  writeFileSync(log, '');
  setEnvironment('FAKE_PYTHON_LOG', log);
  return (tool, subcommand) =>
    readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((call) => call.tool === tool && call.args[0] === subcommand);
}

const readReport = (reportRoot, name) => readFileSync(path.join(reportRoot, name), 'utf8');

describe('parsing formatter output', () => {
  it('reads the files black would reformat from stderr', () => {
    const stderr =
      'would reformat /work/a.py\nwould reformat /work/b c.py\n\nOh no!\n2 files would be reformatted\n';

    expect(unformattedPaths('black', { stdout: 'would reformat /ignored.py\n', stderr })).toEqual([
      '/work/a.py',
      '/work/b c.py',
    ]);
  });
  it('reads the file headers of the ruff format diff', () => {
    const stdout = [
      '--- src/a.py',
      '+++ src/a.py',
      '@@ -1,2 +1,2 @@',
      '--- not a header',
      '+++ different',
      '--- src/b.py',
      '+++ src/b.py',
      '',
    ].join('\n');

    expect(
      unformattedPaths('ruff', { stdout, stderr: '--- ignored.py\n+++ ignored.py\n' }),
    ).toEqual(['src/a.py', 'src/b.py']);
  });
});
describe('formatter failures that are only unparsable files', () => {
  it.each([
    ['black', 123, 'error: cannot format /w/a.py: Cannot parse: 1:6\n    print "a"\n'],
    [
      'black',
      123,
      'error: cannot format /w/a.py: Cannot parse for target version Python 3.9: 1:6\n',
    ],
    ['black', 123, 'error: cannot parse for target version Python 3.15: /w/a.py:1:6\n'],
    ['ruff', 2, 'error: Failed to parse a.py:1:7: Simple statements must be separated\n'],
  ])('accepts %s exit %i for %j', (formatter, status, stderr) => {
    expect(onlyUnparsableFiles(formatter, { status, stdout: '', stderr })).toBe(true);
  });
  it.each([
    ['black', 123, 'error: cannot format /w/a.py: INTERNAL ERROR: boom\n'],
    ['black', 1, 'error: cannot format /w/a.py: Cannot parse: 1:6\n'],
    ['black', 123, ''],
    ['ruff', 2, 'error: Failed to parse a.py:1:7: x\nerror: Invalid value for --config\n'],
  ])('rejects %s exit %i for %j', (formatter, status, stderr) => {
    expect(onlyUnparsableFiles(formatter, { status, stdout: '', stderr })).toBe(false);
  });
});
describe('tool context', () => {
  it('puts the snapshot import roots before any existing PYTHONPATH', () => {
    const root = project();
    setEnvironment('PYTHONPATH', '/existing');

    const { context, reportRoot } = contextFor(root);

    expect(context.env).toEqual({
      PYTHONPATH: `${path.join(root, 'src')}${path.delimiter}/existing`,
      PYTHONDONTWRITEBYTECODE: '1',
      COVERAGE_FILE: path.join(reportRoot, '.coverage'),
    });
    expect(context.project).toEqual({
      formatter: 'ruff',
      formatterDetected: true,
      testRunner: 'unittest',
      targetVersion: 'py38',
      typeCheckers: [],
      sourceRoots: ['src'],
    });
  });
  it('takes the environment from the live checkout and the sources from the snapshot', () => {
    const live = project();
    const snapshot = temporaryRoot();
    mkdirSync(path.join(snapshot, 'src'));
    setEnvironment('PYTHONPATH', undefined);

    const context = createToolContext({
      projectRoot: snapshot,
      liveRoot: live,
      settings: { formatter: 'black', testRunner: 'unittest', sourceRoots: ['src'] },
    });

    expect(context.env).toEqual({
      PYTHONPATH: path.join(snapshot, 'src'),
      PYTHONDONTWRITEBYTECODE: '1',
    });
    expect(context.launcher.launch('ruff', []).env.VIRTUAL_ENV).toBe(path.join(live, '.venv'));
    expect(context.project).toEqual({
      formatter: 'black',
      formatterDetected: false,
      typeCheckers: [],
      testRunner: 'unittest',
      targetVersion: 'py38',
      sourceRoots: ['src'],
    });
  });
});
describe('running the tools', () => {
  it('writes the ruff, format and coverage reports of a clean project', () => {
    const root = project({
      'violations.txt': 'F401|src/demo/a.py|unused\n',
      'unformatted.txt': 'src/demo/a.py\n',
    });
    const { context, reportRoot } = contextFor(root);

    expect(runPythonTools(context)).toEqual([]);

    expect(JSON.parse(readReport(reportRoot, 'ruff.sarif')).runs[0].results).toHaveLength(1);
    expect(readReport(reportRoot, 'format.txt')).toBe('src/demo/a.py');
    expect(readReport(reportRoot, 'coverage.json')).toBe('{"files":{}}');
    expect(JSON.parse(readReport(reportRoot, 'type-check.json'))).toEqual({
      checker: 'mypy',
      output: '',
    });
    expect(readReport(reportRoot, 'rules.json')).toBe('[]');
    expect(JSON.parse(readReport(reportRoot, 'manifest.json'))).toEqual({
      formatter: 'ruff',
      formatterDetected: true,
      sourceRoots: ['src'],
      testsRan: true,
    });
    expect(readReport(reportRoot, 'coveragerc')).toBe(coverageRc('src'));
  });
  it('checks formatting with black when the project uses it', () => {
    const root = project({
      'pyproject.toml': '[tool.black]\n',
      'unformatted.txt': 'src/demo/a.py\n',
    });
    const { context, reportRoot } = contextFor(root);

    expect(runPythonTools(context)).toEqual([]);

    expect(readReport(reportRoot, 'format.txt')).toBe(path.join(root, 'src/demo/a.py'));
  });
  it('measures branches without honoring pragmas, the project config or test files', () => {
    const { context, reportRoot } = contextFor(
      project({ 'pyproject.toml': '[tool.coverage.run]\n' }),
    );

    runPythonTools(context);

    expect(readReport(reportRoot, 'coveragerc')).toBe(coverageRc('src'));
  });
  it('measures the source roots that exist and writes an empty report when none does', () => {
    const calls = callsLog();
    const root = project({ 'lib/a.py': '' });
    const both = contextFor(root, { sourceRoots: ['src', 'lib', 'missing'] });
    runPythonTools(both.context);
    expect(readReport(both.reportRoot, 'coveragerc')).toBe(coverageRc('src', 'lib'));

    const none = contextFor(root, { sourceRoots: ['missing'] });
    expect(runPythonTools(none.context)).toEqual([]);
    expect(readReport(none.reportRoot, 'coverage.json')).toBe('{"files":{}}');
    expect(calls('coverage', 'json')).toHaveLength(1);
  });
  it('names each failing step with its command and output', () => {
    const calls = ['ruff format', 'coverage run', 'mypy', 'python'];
    const structureScript = path.resolve(
      new URL('../', import.meta.url).pathname,
      '../metrics/structure_metrics.py',
    );
    const root = project({
      'fail.json': JSON.stringify(
        Object.fromEntries(calls.map((call) => [call, `${call} blew up`])),
      ),
    });
    const { context } = contextFor(root);

    const failures = runPythonTools(context);

    expect(failures).toEqual(
      [
        ['format-failed', 'ruff format', 'ruff format'],
        ['tests-failed', 'coverage run', 'coverage run'],
        ['types-failed', 'mypy', 'mypy'],
        ['rules-failed', 'python', 'python'],
        ['structure-failed', `python ${structureScript}`, 'python'],
      ].map(([rule, command, call]) => ({
        rule,
        message: `${command} exited 2 in the virtualenv environment:\n${call} blew up`,
      })),
    );
  });
  it('names a failing coverage report', () => {
    const root = project({ 'fail.json': JSON.stringify({ 'coverage json': 'it blew up' }) });
    const { context } = contextFor(root);

    expect(runPythonTools(context)).toEqual([
      {
        rule: 'coverage-failed',
        message: 'coverage json exited 2 in the virtualenv environment:\nit blew up',
      },
    ]);
  });
  it('fails the lint step and the rules step when ruff itself fails', () => {
    const root = project({ 'fail.json': JSON.stringify({ 'ruff check': 'it blew up' }) });
    const { context } = contextFor(root);

    expect(runPythonTools(context).map(({ rule }) => rule)).toEqual([
      'ruff-failed',
      'rules-failed',
    ]);
  });
  it('reports every failing step, not only the first', () => {
    const root = project({ 'fail.json': JSON.stringify({ ruff: 'bad', coverage: 'worse' }) });
    const { context } = contextFor(root);

    expect(runPythonTools(context).map(({ rule }) => rule)).toEqual([
      'ruff-failed',
      'format-failed',
      'tests-failed',
      'rules-failed',
    ]);
  });
  it('accepts a run without tests', () => {
    const root = project({ 'test-exit.txt': '5\n' });
    const { context } = contextFor(root);

    expect(runPythonTools(context)).toEqual([]);
    expect(JSON.parse(readReport(context.reportRoot, 'manifest.json')).testsRan).toBe(false);
  });
  it('reports a failing test run with its output', () => {
    const root = project({ 'test-exit.txt': '1\n' });
    const { context } = contextFor(root);

    expect(runPythonTools(context)).toEqual([
      {
        rule: 'tests-failed',
        message: 'coverage run exited 1 in the virtualenv environment:\n1 failed: test_greet',
      },
    ]);
  });
  it('keeps the end of a long failure message', () => {
    const root = project({ 'fail.json': JSON.stringify({ ruff: `${'x'.repeat(5000)}THE END` }) });
    const { context } = contextFor(root);

    const [{ message }] = runPythonTools(context);

    expect(message).toMatch(
      /^ruff check exited 2 in the virtualenv environment:\n\.\.\.x+THE END$/,
    );
    expect(message.length).toBeLessThan(3200);
  });
  it('rejects a formatter that fails the check without naming a file', () => {
    const root = project({ 'unformatted.txt': 'src/demo/a.py\n' });
    writeFileSync(
      path.join(root, '.venv/bin/ruff'),
      `#!/bin/sh\nif [ "$1" = format ]; then echo 'something unexpected'; exit 1; fi\nexec "${process.execPath}" "${path.join(new URL('../', import.meta.url).pathname, 'fixtures/fake-python-tools.mjs')}" ruff "$@"\n`,
    );
    const { context } = contextFor(root);

    expect(runPythonTools(context)).toEqual([
      {
        rule: 'format-failed',
        message:
          'ruff reported unformatted files but its output named none:\nsomething unexpected\n',
      },
    ]);
  });
  it('writes the duplicate, import and import-linter reports', () => {
    const clone = [
      'def order_total(lines, discount):',
      '    total = 0',
      '    for line in lines:',
      '        if line.price > 0 and line.quantity > 0:',
      '            total += line.price * line.quantity',
      '        else:',
      '            total -= discount',
      '    return total',
      '',
    ].join('\n');
    const root = project({
      'src/demo/__init__.py': '',
      'src/demo/a.py': clone,
      'src/demo/b.py': clone,
      '.importlinter': '[importlinter]\nroot_package = demo\n',
      'import-scan.json': '{"src/demo/a.py":[]}',
      'lint-imports.txt': 'Contracts: 1 kept, 0 broken.\n',
    });
    const { context, reportRoot } = contextFor(root);

    expect(runPythonTools(context)).toEqual([]);

    expect(JSON.parse(readReport(reportRoot, 'duplicates.json')).runs).toHaveLength(1);
    expect(JSON.parse(readReport(reportRoot, 'imports.json'))).toEqual({
      modules: [
        { file: 'src/demo/__init__.py', module: 'demo', isPackage: true },
        { file: 'src/demo/a.py', module: 'demo.a', isPackage: false },
        { file: 'src/demo/b.py', module: 'demo.b', isPackage: false },
      ],
      imports: { 'src/demo/a.py': [] },
    });
    expect(readReport(reportRoot, 'import-linter.txt')).toBe('Contracts: 1 kept, 0 broken.\n');
  });
  it('does not run import-linter for a project without contracts', () => {
    const root = project({ 'lint-imports.txt': 'Contracts: 0 kept, 1 broken.\n' });
    const { context, reportRoot } = contextFor(root);

    expect(runPythonTools(context)).toEqual([]);

    expect(() => readReport(reportRoot, 'import-linter.txt')).toThrow();
  });
  it.each([
    ['python', 'coupling-failed'],
    ['lint-imports', 'import-linter-failed'],
  ])('names the failing step: %s is %s', (tool, rule) => {
    const root = project({
      'src/demo/a.py': '',
      '.importlinter': '[importlinter]\nroot_package = demo\n',
      'fail.json': JSON.stringify({ [tool]: 'it blew up' }),
    });
    const { context } = contextFor(root, { testRunner: 'unittest' });

    expect(runPythonTools(context).map((failure) => failure.rule)).toContain(rule);
  });
  it('says where a missing tool should be installed', () => {
    const root = project({}, { tools: ['black', 'coverage', 'python'] });
    setEnvironment('PATH', temporaryRoot());
    const { context } = contextFor(root);

    expect(runPythonTools(context)[0]).toEqual({
      rule: 'ruff-failed',
      message:
        'ruff was not found in the virtualenv environment: install it there (for example as a dev dependency), or set "python.environment" to the environment that has it',
    });
  });
  it('tells how to turn the contracts off when lint-imports is not installed', () => {
    const root = project(
      { '.importlinter': '[importlinter]\nroot_package = demo\n', 'conftest.py': '' },
      { tools: ['ruff', 'coverage', 'mypy', 'python'] },
    );
    const { context } = contextFor(root);

    expect(runPythonTools(context)).toEqual([
      {
        rule: 'import-linter-failed',
        message:
          'lint-imports was not found in the virtualenv environment: install it there (for example as a dev dependency), or set "python.environment" to the environment that has it, or turn the contracts off with "python": { "importLinter": false }',
      },
    ]);
  });
});
