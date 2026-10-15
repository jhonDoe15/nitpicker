import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';

import { tmpdir } from 'node:os';

import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { jscpdVersion } from '../../../java/adapters/metrics/java-duplicates.mjs';

import { installFakeToolchain } from '../fixtures/fake-toolchain.mjs';

import { failure } from './python-process.mjs';

import {
  createToolContext,
  mutationVersions,
  runPythonTools,
  toolVersions,
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

describe('running the tools', () => {
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
      {
        rule: 'python-failed',
        message: `EISDIR: illegal operation on a directory, open '${path.join(reportRoot, 'format.txt')}'`,
      },
    ]);
  });
});
describe('lint and format arguments', () => {
  it('lints for the python versions the project supports and keeps excluded paths out of every tool', () => {
    const calls = callsLog();
    const root = project({ 'pyproject.toml': '[project]\nrequires-python = ">=3.10"\n' });

    const { context, reportRoot } = contextFor(root, {}, ['legacy/**']);
    runPythonTools(context);

    expect(calls('ruff', 'check')[0].args).toEqual([
      'check',
      '--config',
      path.resolve(new URL('../', import.meta.url).pathname, '../ruff/nitpicker-ruff.toml'),
      '--target-version',
      'py310',
      '--ignore-noqa',
      '--no-cache',
      '--extend-exclude',
      'legacy/**',
      '--output-format',
      'sarif',
      '--output-file',
      path.join(reportRoot, 'ruff.sarif'),
      '.',
    ]);
    expect(calls('ruff', 'format')[0].args).toEqual([
      'format',
      '--check',
      '--diff',
      '--no-cache',
      '--extend-exclude',
      'legacy/**',
      '.',
    ]);
  });
  it('gives black the excluded globs as one regular expression', () => {
    const calls = callsLog();
    const root = project({ 'pyproject.toml': '[tool.black]\n' });

    runPythonTools(contextFor(root, {}, ['legacy/**', 'gen']).context);

    const { args } = calls('black', '--check')[0];
    expect(args[args.indexOf('--extend-exclude') + 1]).toBe(
      '^/(?:legacy/.*)(?:/.*)?/?$|^/(?:gen)(?:/.*)?/?$',
    );
  });
  it.each(['ruff', 'black'])('skips the files %s cannot parse', (formatter) => {
    const root = project({
      'unparsable.txt': 'legacy/old.py\n',
      'unformatted.txt': 'src/demo/a.py\n',
    });
    const { context, reportRoot } = contextFor(root, { formatter });

    expect(runPythonTools(context)).toEqual([]);
    expect(readReport(reportRoot, 'format.txt')).toMatch(/src\/demo\/a\.py$/);
  });
  it('still fails when the formatter exits with its failure status for another reason', () => {
    const root = project({ 'fail.json': JSON.stringify({ 'ruff format': 'invalid config' }) });
    const { context } = contextFor(root);

    expect(runPythonTools(context)).toEqual([
      {
        rule: 'format-failed',
        message: 'ruff format exited 2 in the virtualenv environment:\ninvalid config',
      },
    ]);
  });
});
describe('running pytest', () => {
  it('keeps the project pytest configuration working under the outer coverage run', () => {
    const calls = callsLog();
    const root = project({
      'conftest.py': '',
      'pytest-cov.txt': '',
      'xdist.txt': '',
    });
    const { context, reportRoot } = contextFor(root);

    runPythonTools(context);

    expect(calls('coverage', 'run')[0].args.slice(3)).toEqual([
      '-m',
      'pytest',
      '-q',
      '-o',
      `cache_dir=${path.join(reportRoot, 'pytest-cache')}`,
      '--no-cov',
      '-n0',
    ]);
  });
  it('is an environment error naming the override when pytest is indicated but not importable', () => {
    const root = project({ 'conftest.py': '', 'no-pytest.txt': '' });
    const { context } = contextFor(root);

    expect(runPythonTools(context)).toEqual([
      {
        rule: 'environment-failed',
        message:
          'pytest is used by this project but cannot be imported in the virtualenv environment: install it there, or set "python.testRunner" to "unittest"',
      },
    ]);
  });
});
describe('failure messages', () => {
  it('says a tool timed out instead of quoting the system error', () => {
    const root = project();
    const { context } = contextFor(root);

    const error = failure({
      context,
      command: ['coverage', 'run'],
      result: { error: { code: 'ETIMEDOUT' } },
      rule: 'x',
    });

    expect(error.message).toBe(
      'coverage run timed out after 25 minutes in the virtualenv environment',
    );
  });
});
describe('tool versions', () => {
  it('lists the versions of the tools in use', () => {
    const root = project({ 'conftest.py': '' });

    const jscpd = `jscpd@${jscpdVersion()}`;

    expect(toolVersions(contextFor(root).context)).toBe(
      `ruff@0.9.9;mypy@1.13.0;coverage@7.6.1;pytest@8.3.1;${jscpd}`,
    );
    expect(toolVersions(contextFor(root, { formatter: 'black' }).context)).toBe(
      `ruff@0.9.9;black@24.1.0;mypy@1.13.0;coverage@7.6.1;pytest@8.3.1;${jscpd}`,
    );
    expect(toolVersions(contextFor(root, { typeChecker: 'pyright' }).context)).toBe(
      `ruff@0.9.9;pyright@1.1.390;coverage@7.6.1;pytest@8.3.1;${jscpd}`,
    );
    expect(toolVersions(contextFor(project()).context)).toBe(
      `ruff@0.9.9;mypy@1.13.0;coverage@7.6.1;unittest;${jscpd}`,
    );
    expect(mutationVersions(contextFor(root).context)).toBe('mutmut@3.8.0;pytest@8.3.1');
  });
  it('adds import-linter to the versions when the project has contracts', () => {
    const root = project({ '.importlinter': '[importlinter]\n', 'conftest.py': '' });

    expect(toolVersions(contextFor(root).context)).toBe(
      `ruff@0.9.9;mypy@1.13.0;coverage@7.6.1;pytest@8.3.1;jscpd@${jscpdVersion()};import-linter@2.5`,
    );
    expect(toolVersions(contextFor(root, { importLinter: false }).context)).not.toContain(
      'import-linter',
    );
  });
  it('reads the import-linter version from the installed package, which old versions can only give that way', () => {
    const calls = callsLog();
    const root = project({ '.importlinter': '[importlinter]\n', 'conftest.py': '' });

    toolVersions(contextFor(root).context);

    expect(calls('python', '-I').map((call) => call.args.at(-1))).toEqual([
      'import importlib.metadata as m; print(m.version("import-linter"))',
    ]);
    expect(calls('lint-imports', '--version')).toEqual([]);
  });
  it('marks tools that are missing', () => {
    const root = project({ 'no-pytest.txt': '', 'no-mutmut.txt': '' }, { tools: ['python'] });
    setEnvironment('PATH', temporaryRoot());

    const jscpd = `jscpd@${jscpdVersion()}`;

    expect(toolVersions(contextFor(root, { testRunner: 'pytest' }).context)).toBe(
      `ruff@missing;types@missing;coverage@missing;pytest@missing;${jscpd}`,
    );
    expect(toolVersions(contextFor(root).context)).toBe(
      `ruff@missing;types@missing;coverage@missing;unittest;${jscpd}`,
    );
    expect(mutationVersions(contextFor(root).context)).toBe('mutmut@missing;pytest@missing');
  });
  it('marks a version it cannot read', () => {
    const root = project();
    writeFileSync(path.join(root, '.venv/bin/ruff'), '#!/bin/sh\necho ruff dev build\n', {
      mode: 0o755,
    });

    expect(toolVersions(contextFor(root).context)).toMatch(/^ruff@unknown;/);
  });
});
