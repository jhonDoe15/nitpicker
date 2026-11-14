import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fieldOf, parseJson, textsOf } from '../../../shared/values/readers.mts';
import { jscpdVersion } from './typed/tests/tools-test-views.mts';
import { createFakeProjects } from './test-support/fake-project.mts';
import { toolVersions } from './python-tools.mjs';
import { PYRIGHT_TOOL, pyrightConfig } from './project-tools/pyright/pyright-config.mjs';
import { resolveTypeChecker, TYPES_REPORT, typeCheck } from './python-types.mjs';

const fakes = createFakeProjects();
const saved = new Map<string, string | undefined>();

function setEnvironment(name: string, value: string | undefined): void {
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

function argsOf(call: object | undefined): string[] {
  return textsOf(fieldOf(call, 'args'));
}

function enabledErrorCodes(args: readonly string[]) {
  return args.filter((_arg: string, index: number) => args[index - 1] === '--enable-error-code');
}

function logged() {
  const logFile = path.join(fakes.temporaryRoot(), 'calls.jsonl');
  setEnvironment('FAKE_PYTHON_LOG', logFile);
  return logFile;
}

const report = (reportRoot: string): unknown =>
  parseJson(readFileSync(path.join(reportRoot, TYPES_REPORT), 'utf8'));

describe('choosing the type checker', () => {
  it('uses the configured or detected checker without asking the environment', () => {
    const root = fakes.project({ 'pyrightconfig.json': '{}' });

    expect(resolveTypeChecker(fakes.contextFor(root).context)).toBe(PYRIGHT_TOOL);
    expect(resolveTypeChecker(fakes.contextFor(root, { typeChecker: 'mypy' }).context)).toBe(
      'mypy',
    );
  });

  it('asks the environment when the project says nothing, mypy first', () => {
    const both = fakes.project();
    const pyrightOnly = fakes.project({}, { tools: [PYRIGHT_TOOL, 'python'] });
    setEnvironment('PATH', fakes.temporaryRoot());

    expect(resolveTypeChecker(fakes.contextFor(both).context)).toBe('mypy');
    expect(resolveTypeChecker(fakes.contextFor(pyrightOnly).context)).toBe(PYRIGHT_TOOL);
  });

  it('asks the environment when the project mentions both, and takes the one installed', () => {
    const tied = { 'pyrightconfig.json': '{}', 'mypy.ini': '[mypy]\n' };
    const both = fakes.project(tied);
    const pyrightOnly = fakes.project(tied, { tools: [PYRIGHT_TOOL, 'python'] });
    const neither = fakes.project(tied, { tools: ['python'] });
    setEnvironment('PATH', fakes.temporaryRoot());

    expect(resolveTypeChecker(fakes.contextFor(both).context)).toBe('mypy');
    expect(resolveTypeChecker(fakes.contextFor(pyrightOnly).context)).toBe(PYRIGHT_TOOL);
    expect(resolveTypeChecker(fakes.contextFor(neither).context)).toBeUndefined();
  });

  it('detects basedpyright from its table or its dependency name', () => {
    const detect = (files: Readonly<Record<string, string>>): unknown =>
      resolveTypeChecker(fakes.contextFor(fakes.project(files)).context);

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
    const [call] = fakes.calls(logFile).filter((entry) => argsOf(entry).includes('--strict'));
    expect(argsOf(call)).toEqual([
      '--config-file',
      path.join(reportRoot, 'mypy.ini'),
      '--python-executable',
      path.join(root, '.venv/bin/python'),
      '--strict',
      '--explicit-package-bases',
      '--show-error-codes',
      '--show-column-numbers',
      '--no-error-summary',
      '--no-pretty',
      '--hide-error-context',
      '--no-color-output',
      '--cache-dir',
      path.join(reportRoot, 'mypy-cache'),
      'src',
      'lib',
    ]);
    expect(fieldOf(call, 'cwd')).toBe(root);
  });

  it('leaves --strict to the generated config when the project is listed', () => {
    const logFile = logged();
    const root = fakes.project({ 'mypy.ini': '[mypy]\ndisallow_untyped_defs = False\n' });
    const { context, reportRoot } = fakes.contextFor(
      root,
      {},
      {
        toolPrecedence: { mypy: ['project', 'nitpicker'] },
        policyRoot: root,
      },
    );

    typeCheck(context);

    const [call] = fakes
      .calls(logFile)
      .filter((entry) => argsOf(entry).includes('--explicit-package-bases'));
    expect(argsOf(call)).not.toContain('--strict');
    expect(readFileSync(path.join(reportRoot, 'mypy.ini'), 'utf8')).toBe(
      '[mypy]\nstrict = true\ndisallow_untyped_defs = False\n',
    );
  });

  it('passes nitpicker exclude as an --exclude argument when the project config is listed', () => {
    const logFile = logged();
    const root = fakes.project({ 'mypy.ini': '[mypy]\nexclude = (?x)(\n  ^legacy/\n  )\n' });
    const loose = fakes.contextFor(
      root,
      {},
      { toolPrecedence: { mypy: ['project', 'nitpicker'] }, policyRoot: root },
    );
    const { reportRoot } = loose;
    const context = { ...loose.context, exclude: ['src/gen/**'] };

    typeCheck(context);

    const [call] = fakes
      .calls(logFile)
      .filter((entry) => argsOf(entry).includes('--explicit-package-bases'));
    expect(
      argsOf(call).slice(argsOf(call).indexOf('--exclude'), argsOf(call).indexOf('--exclude') + 2),
    ).toEqual(['--exclude', '^(?:(?:src/gen/.*)(?:/.*)?/?)$']);
    expect(readFileSync(path.join(reportRoot, 'mypy.ini'), 'utf8')).toBe(
      '[mypy]\nstrict = true\nexclude = (?x)(\n    ^legacy/\n    )\n',
    );
  });

  it.each([
    ['1.13.0', false],
    ['1.14.0', true],
    ['1.20.1', true],
    ['2.0.0', true],
    ['0.991', false],
  ])('mypy %s asks for the deprecated error code: %s', (version, asked) => {
    const logFile = logged();
    const root = fakes.project({ 'mypy-version.txt': version });
    const { context } = fakes.contextFor(root);

    typeCheck(context);

    const [call] = fakes.calls(logFile).filter((entry) => argsOf(entry).includes('--strict'));
    expect(enabledErrorCodes(argsOf(call))).toEqual(asked ? ['deprecated'] : []);
  });

  it('adds the import roots to MYPYPATH before an existing value', () => {
    const logFile = logged();
    setEnvironment('MYPYPATH', '/existing');
    const root = fakes.project();
    const { context } = fakes.contextFor(root);

    typeCheck(context);

    const [call] = fakes.calls(logFile).filter((entry) => argsOf(entry).includes('--strict'));
    expect(fieldOf(call, 'mypyPath')).toBe(`${path.join(root, 'src')}${path.delimiter}/existing`);
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
    const loose = fakes.contextFor(root, {});
    const { reportRoot } = loose;
    const context = { ...loose.context, exclude: ['src/gen/**'] };

    typeCheck(context);

    const [call] = fakes.calls(logFile).filter((entry) => argsOf(entry).includes('--strict'));
    expect(argsOf(call).slice(0, 2)).toEqual([
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

    const internalError: unknown = expect.stringContaining('internal error');
    expect(() => {
      typeCheck(context);
    }).toThrow(
      expect.objectContaining({
        rule: 'types-failed',
        message: internalError,
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
    const [call] = fakes.calls(logFile).filter((entry) => argsOf(entry).includes('--outputjson'));
    expect([call?.tool, argsOf(call)]).toEqual([
      'basedpyright',
      ['--outputjson', '--project', path.join(reportRoot, 'pyrightconfig.json')],
    ]);
    expect(JSON.parse(readFileSync(path.join(reportRoot, 'pyrightconfig.json'), 'utf8'))).toEqual({
      typeCheckingMode: 'strict',
      reportDeprecated: 'error',
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
    const { context, reportRoot } = fakes.contextFor(root, { typeChecker: PYRIGHT_TOOL });

    typeCheck(context);

    expect(report(reportRoot)).toEqual({
      checker: PYRIGHT_TOOL,
      output: '{"generalDiagnostics":[]}',
    });
    const [call] = fakes.calls(logFile).filter((entry) => argsOf(entry).includes('--outputjson'));
    expect(argsOf(call)).toEqual([
      '--outputjson',
      '--project',
      path.join(reportRoot, 'pyrightconfig.json'),
    ]);
    expect(JSON.parse(readFileSync(path.join(reportRoot, 'pyrightconfig.json'), 'utf8'))).toEqual({
      typeCheckingMode: 'strict',
      reportDeprecated: 'error',
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
      reportDeprecated: 'error',
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
