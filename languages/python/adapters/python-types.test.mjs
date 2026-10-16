import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { jscpdVersion } from '../../java/adapters/metrics/java-duplicates.mjs';
import { createFakeProjects } from './test-support/fake-project.mjs';
import { toolVersions } from './python-tools.mjs';
import { pyrightConfig } from './project-tools/pyright-config.mjs';
import { resolveTypeChecker, typeCheck } from './python-types.mjs';

const fakes = createFakeProjects();
const saved = new Map();

function setEnvironment(name, value) {
  if (!saved.has(name)) {
    saved.set(name, process.env[name]);
  }
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  for (const [name, value] of saved) {
    setEnvironment(name, value);
  }
  saved.clear();
  fakes.cleanup();
});

function logged() {
  const logFile = path.join(fakes.temporaryRoot(), 'calls.jsonl');
  setEnvironment('FAKE_PYTHON_LOG', logFile);
  return logFile;
}

const report = (reportRoot) =>
  JSON.parse(readFileSync(path.join(reportRoot, 'type-check.json'), 'utf8'));

describe('choosing the type checker', () => {
  it('uses the configured or detected checker without asking the environment', () => {
    const root = fakes.project({ 'pyrightconfig.json': '{}' });

    expect(resolveTypeChecker(fakes.contextFor(root).context)).toBe('pyright');
    expect(resolveTypeChecker(fakes.contextFor(root, { typeChecker: 'mypy' }).context)).toBe(
      'mypy',
    );
  });

  it('asks the environment when the project says nothing, mypy first', () => {
    const both = fakes.project();
    const pyrightOnly = fakes.project({}, { tools: ['pyright', 'python'] });
    setEnvironment('PATH', fakes.temporaryRoot());

    expect(resolveTypeChecker(fakes.contextFor(both).context)).toBe('mypy');
    expect(resolveTypeChecker(fakes.contextFor(pyrightOnly).context)).toBe('pyright');
  });

  it('asks the environment when the project mentions both, and takes the one installed', () => {
    const tied = { 'pyrightconfig.json': '{}', 'mypy.ini': '[mypy]\n' };
    const both = fakes.project(tied);
    const pyrightOnly = fakes.project(tied, { tools: ['pyright', 'python'] });
    const neither = fakes.project(tied, { tools: ['python'] });
    setEnvironment('PATH', fakes.temporaryRoot());

    expect(resolveTypeChecker(fakes.contextFor(both).context)).toBe('mypy');
    expect(resolveTypeChecker(fakes.contextFor(pyrightOnly).context)).toBe('pyright');
    expect(resolveTypeChecker(fakes.contextFor(neither).context)).toBeUndefined();
  });

  it('detects basedpyright from its table or its dependency name', () => {
    const detect = (files) => resolveTypeChecker(fakes.contextFor(fakes.project(files)).context);

    expect(detect({ 'pyproject.toml': '[tool.basedpyright]\n' })).toBe('basedpyright');
    expect(detect({ 'pyproject.toml': 'dev = ["basedpyright>=1.20"]\n' })).toBe('basedpyright');
  });

  it('takes the installed basedpyright when the project says nothing and mypy is missing', () => {
    const basedOnly = fakes.project({}, { tools: ['basedpyright', 'python'] });
    setEnvironment('PATH', fakes.temporaryRoot());

    expect(resolveTypeChecker(fakes.contextFor(basedOnly).context)).toBe('basedpyright');
  });

  it('finds none when neither is installed', () => {
    const root = fakes.project({}, { tools: ['python'] });
    setEnvironment('PATH', fakes.temporaryRoot());

    expect(resolveTypeChecker(fakes.contextFor(root).context)).toBeUndefined();
  });
});

describe('running mypy', () => {
  it('runs it strict, with its cache in the report directory, and keeps its output', () => {
    const logFile = logged();
    const root = fakes.project({
      'type-errors.txt': 'src/demo/a.py:1: error: Oops  [misc]\n',
    });
    const { context, reportRoot } = fakes.contextFor(root, { sourceRoots: ['src', 'lib'] });

    typeCheck(context);

    expect(report(reportRoot)).toEqual({
      checker: 'mypy',
      output: 'src/demo/a.py:1: error: Oops  [misc]\n',
    });
    const [call] = fakes.calls(logFile).filter(({ args }) => args.includes('--strict'));
    expect(call.args).toEqual([
      '--config-file',
      path.join(reportRoot, 'mypy.ini'),
      '--python-executable',
      path.join(root, '.venv/bin/python'),
      '--strict',
      '--explicit-package-bases',
      '--show-error-codes',
      '--no-error-summary',
      '--no-pretty',
      '--hide-error-context',
      '--no-color-output',
      '--cache-dir',
      path.join(reportRoot, 'mypy-cache'),
      'src',
      'lib',
    ]);
    expect(call.cwd).toBe(root);
  });

  it('adds the import roots to MYPYPATH before an existing value', () => {
    const logFile = logged();
    setEnvironment('MYPYPATH', '/existing');
    const root = fakes.project();
    const { context } = fakes.contextFor(root);

    typeCheck(context);

    const [call] = fakes.calls(logFile).filter(({ args }) => args.includes('--strict'));
    expect(call.mypyPath).toBe(`${path.join(root, 'src')}${path.delimiter}/existing`);
  });

  it('checks with a generated config that keeps the environment and drops what skips checking', () => {
    const logFile = logged();
    const root = fakes.project({
      'pyproject.toml': [
        '[tool.mypy]',
        'ignore_errors = true',
        'disable_error_code = ["arg-type"]',
        'exclude = ["src/demo"]',
        'plugins = ["pydantic.mypy"]',
        'python_version = "3.11"',
        '',
        '[[tool.mypy.overrides]]',
        'module = "yaml"',
        'ignore_missing_imports = true',
        'ignore_errors = true',
        '',
      ].join('\n'),
    });
    const { context, reportRoot } = fakes.contextFor(root, {}, ['src/gen/**']);

    typeCheck(context);

    const [call] = fakes.calls(logFile).filter(({ args }) => args.includes('--strict'));
    expect(call.args.slice(0, 2)).toEqual([
      '--config-file',
      path.join(reportRoot, 'pyproject.toml'),
    ]);
    expect(readFileSync(path.join(reportRoot, 'pyproject.toml'), 'utf8')).toBe(
      [
        '[tool.mypy]',
        'plugins = [ "pydantic.mypy" ]',
        'python_version = "3.11"',
        'exclude = "^(?:(?:src/gen/.*)(?:/.*)?/?)$"',
        '',
        '[[tool.mypy.overrides]]',
        'module = [ "yaml" ]',
        'ignore_missing_imports = true',
        '',
      ].join('\n'),
    );
  });

  it('names the checker and the way out when none is installed', () => {
    const root = fakes.project({}, { tools: ['python'] });
    setEnvironment('PATH', fakes.temporaryRoot());
    const { context } = fakes.contextFor(root);

    expect(() => {
      typeCheck(context);
    }).toThrow(
      'No type checker found in the virtualenv environment: install mypy, pyright or basedpyright there, or set "python.typeChecker" in nitpicker.config.json',
    );
  });

  it('says where a configured checker should be installed', () => {
    const root = fakes.project({}, { tools: ['python'] });
    setEnvironment('PATH', fakes.temporaryRoot());
    const { context } = fakes.contextFor(root, { typeChecker: 'mypy' });

    expect(() => {
      typeCheck(context);
    }).toThrow('mypy was not found in the virtualenv environment: install it there');
  });

  it('fails with the types-failed rule when the checker crashes', () => {
    const root = fakes.project({ 'fail.json': JSON.stringify({ mypy: 'internal error' }) });
    const { context } = fakes.contextFor(root);

    expect(() => {
      typeCheck(context);
    }).toThrow(
      expect.objectContaining({
        rule: 'types-failed',
        message: expect.stringContaining('internal error'),
      }),
    );
  });
});

describe('running basedpyright', () => {
  it('runs it with the same strict project file as pyright', () => {
    const logFile = logged();
    const root = fakes.project({ 'pyright.json': '{"generalDiagnostics":[]}' });
    const { context, reportRoot } = fakes.contextFor(root, { typeChecker: 'basedpyright' });

    typeCheck(context);

    expect(report(reportRoot)).toEqual({
      checker: 'basedpyright',
      output: '{"generalDiagnostics":[]}',
    });
    const [call] = fakes.calls(logFile).filter(({ args }) => args.includes('--outputjson'));
    expect([call.tool, call.args]).toEqual([
      'basedpyright',
      ['--outputjson', '--project', path.join(reportRoot, 'pyrightconfig.json')],
    ]);
    expect(JSON.parse(readFileSync(path.join(reportRoot, 'pyrightconfig.json'), 'utf8'))).toEqual({
      typeCheckingMode: 'strict',
      enableTypeIgnoreComments: false,
      ignore: [],
      executionEnvironments: [],
      exclude: ['**/node_modules', '**/__pycache__', '**/.*'],
      include: [path.relative(reportRoot, path.join(root, 'src'))],
      extraPaths: [path.join(root, 'src')],
    });
  });

  it('names its version in the tool versions', () => {
    const root = fakes.project({ 'conftest.py': '' });

    expect(toolVersions(fakes.contextFor(root, { typeChecker: 'basedpyright' }).context)).toBe(
      `ruff@0.9.9;basedpyright@1.40.2;coverage@7.6.1;pytest@8.3.1;jscpd@${jscpdVersion()}`,
    );
  });
});

describe('running pyright', () => {
  it('runs it with a strict project file in the report directory', () => {
    const logFile = logged();
    const root = fakes.project({ 'pyright.json': '{"generalDiagnostics":[]}' });
    const { context, reportRoot } = fakes.contextFor(root, { typeChecker: 'pyright' });

    typeCheck(context);

    expect(report(reportRoot)).toEqual({
      checker: 'pyright',
      output: '{"generalDiagnostics":[]}',
    });
    const [call] = fakes.calls(logFile).filter(({ args }) => args.includes('--outputjson'));
    expect(call.args).toEqual([
      '--outputjson',
      '--project',
      path.join(reportRoot, 'pyrightconfig.json'),
    ]);
    expect(JSON.parse(readFileSync(path.join(reportRoot, 'pyrightconfig.json'), 'utf8'))).toEqual({
      typeCheckingMode: 'strict',
      enableTypeIgnoreComments: false,
      ignore: [],
      executionEnvironments: [],
      exclude: ['**/node_modules', '**/__pycache__', '**/.*'],
      include: [path.relative(reportRoot, path.join(root, 'src'))],
      extraPaths: [path.join(root, 'src')],
    });
  });

  it('checks every source root, resolving packages from their parent', () => {
    const root = fakes.project({ 'pkg/__init__.py': '' });
    const { context, reportRoot } = fakes.contextFor(root, { sourceRoots: ['pkg', 'src'] });

    expect(pyrightConfig(context)).toEqual({
      typeCheckingMode: 'strict',
      enableTypeIgnoreComments: false,
      ignore: [],
      executionEnvironments: [],
      exclude: ['**/node_modules', '**/__pycache__', '**/.*'],
      include: [
        path.relative(reportRoot, path.join(root, 'pkg')),
        path.relative(reportRoot, path.join(root, 'src')),
      ],
      extraPaths: [root, path.join(root, 'src')],
    });
  });
});
