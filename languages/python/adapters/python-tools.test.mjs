import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installFakeToolchain } from './fixtures/fake-toolchain.mjs';
import {
  createToolContext,
  detectTestRunner,
  runPythonTools,
  toolVersions,
  unformattedPaths,
} from './python-tools.mjs';

const roots = [];
const savedEnvironment = new Map();

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-tools-')));
  roots.push(root);
  return root;
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

function contextFor(root, settings = {}) {
  const reportRoot = temporaryRoot();
  return {
    context: createToolContext({ projectRoot: root, liveRoot: root, settings, reportRoot }),
    reportRoot,
  };
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
      testRunner: undefined,
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
    expect(context.project).toMatchObject({ formatter: 'black', testRunner: 'unittest' });
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
    expect(JSON.parse(readReport(reportRoot, 'manifest.json'))).toEqual({
      formatter: 'ruff',
      sourceRoots: ['src'],
    });
    expect(readReport(reportRoot, 'coveragerc')).toBe(
      '[run]\nbranch = True\nparallel = False\nsource =\n    src\n',
    );
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

  it('lists the source roots in the coverage configuration', () => {
    const root = project();
    const { context, reportRoot } = contextFor(root, { sourceRoots: ['src', 'lib'] });

    runPythonTools(context);

    expect(readReport(reportRoot, 'coveragerc')).toBe(
      '[run]\nbranch = True\nparallel = False\nsource =\n    src\n    lib\n',
    );
  });

  it.each([
    ['ruff check', 'ruff-failed'],
    ['ruff format', 'format-failed'],
    ['coverage run', 'tests-failed'],
    ['coverage json', 'coverage-failed'],
  ])('names the failing step: %s is %s', (call, rule) => {
    const root = project({ 'fail.json': JSON.stringify({ [call]: 'it blew up' }) });
    const { context } = contextFor(root);

    expect(runPythonTools(context)).toEqual([
      {
        rule,
        message: expect.stringMatching(
          new RegExp(`^${call} exited 2 in the virtualenv environment:\\nit blew up$`),
        ),
      },
    ]);
  });

  it('reports every failing step, not only the first', () => {
    const root = project({ 'fail.json': JSON.stringify({ ruff: 'bad', coverage: 'worse' }) });
    const { context } = contextFor(root);

    expect(runPythonTools(context).map(({ rule }) => rule)).toEqual([
      'ruff-failed',
      'format-failed',
      'tests-failed',
    ]);
  });

  it('accepts a run without tests', () => {
    const root = project({ 'test-exit.txt': '5\n' });
    const { context } = contextFor(root);

    expect(runPythonTools(context)).toEqual([]);
  });

  it('reports a failing test run with its output', () => {
    const root = project({ 'test-exit.txt': '1\n' });
    const { context } = contextFor(root);

    expect(runPythonTools(context)).toEqual([
      { rule: 'tests-failed', message: expect.stringContaining('1 failed: test_greet') },
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
      `#!/bin/sh\nif [ "$1" = format ]; then echo 'something unexpected'; exit 1; fi\nexec "${process.execPath}" "${path.join(import.meta.dirname, 'fixtures/fake-python-tools.mjs')}" ruff "$@"\n`,
    );
    const { context } = contextFor(root);

    expect(runPythonTools(context)).toEqual([
      {
        rule: 'format-failed',
        message: expect.stringContaining(
          'ruff reported unformatted files but its output named none',
        ),
      },
    ]);
  });

  it('says where a missing tool should be installed', () => {
    const root = project({}, { tools: ['black', 'coverage', 'python'] });
    setEnvironment('PATH', temporaryRoot());
    const { context } = contextFor(root);

    expect(runPythonTools(context)[0]).toEqual({
      rule: 'ruff-failed',
      message:
        'ruff was not found in the virtualenv environment: install it there (for example as a dev dependency)',
    });
  });

  it('reports a tool that cannot run for another reason', () => {
    const root = project();
    writeFileSync(path.join(root, '.venv/bin/ruff'), 'not a program\n', { mode: 0o755 });
    const { context } = contextFor(root);

    const [failure] = runPythonTools(context);

    expect(failure.rule).toBe('ruff-failed');
    expect(failure.message).toMatch(
      /^ruff check (could not run in the virtualenv environment|exited)/,
    );
  });

  it('names a failure that is not a tool failure', () => {
    const root = project();
    const { context, reportRoot } = contextFor(root);
    mkdirSync(path.join(reportRoot, 'format.txt'));

    expect(runPythonTools(context)).toEqual([
      { rule: 'python-failed', message: expect.stringContaining('EISDIR') },
    ]);
  });
});

describe('test runner and versions', () => {
  it('uses pytest when it can be imported and unittest otherwise', () => {
    const root = project();
    const { context } = contextFor(root);
    expect(detectTestRunner(context)).toBe('pytest');

    writeFileSync(path.join(root, 'no-pytest.txt'), '');
    expect(detectTestRunner(context)).toBe('unittest');
  });

  it('keeps the configured test runner even when it is missing', () => {
    const root = project({ 'no-pytest.txt': '' });

    expect(detectTestRunner(contextFor(root, { testRunner: 'pytest' }).context)).toBe('pytest');
    expect(detectTestRunner(contextFor(root, { testRunner: 'unittest' }).context)).toBe('unittest');
  });

  it('lists the versions of the tools in use', () => {
    const root = project();

    expect(toolVersions(contextFor(root).context)).toBe('ruff@0.9.9;coverage@7.6.1;pytest@8.3.1');
    expect(toolVersions(contextFor(root, { formatter: 'black' }).context)).toBe(
      'ruff@0.9.9;black@24.1.0;coverage@7.6.1;pytest@8.3.1',
    );
  });

  it('marks tools that are missing', () => {
    const root = project({ 'no-pytest.txt': '' }, { tools: ['python'] });
    setEnvironment('PATH', temporaryRoot());

    expect(toolVersions(contextFor(root, { testRunner: 'pytest' }).context)).toBe(
      'ruff@missing;coverage@missing;pytest@missing',
    );
    expect(toolVersions(contextFor(root).context)).toBe('ruff@missing;coverage@missing;unittest');
  });

  it('marks a version it cannot read', () => {
    const root = project();
    writeFileSync(path.join(root, '.venv/bin/ruff'), '#!/bin/sh\necho ruff dev build\n', {
      mode: 0o755,
    });

    expect(toolVersions(contextFor(root).context)).toMatch(/^ruff@unknown;/);
  });
});
