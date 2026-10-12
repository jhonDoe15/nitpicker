import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeProjects } from './fixtures/fake-project.mjs';
import { pyrightConfig, resolveTypeChecker, typeCheck } from './python-types.mjs';

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

  it('names the checker and the way out when none is installed', () => {
    const root = fakes.project({}, { tools: ['python'] });
    setEnvironment('PATH', fakes.temporaryRoot());
    const { context } = fakes.contextFor(root);

    expect(() => {
      typeCheck(context);
    }).toThrow(
      'No type checker found in the virtualenv environment: install mypy or pyright there, or set "python.typeChecker" in nitpicker.config.json',
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
      include: [path.relative(reportRoot, path.join(root, 'src'))],
      extraPaths: [path.join(root, 'src')],
    });
  });

  it('extends the project pyright file, or its pyproject section', () => {
    const withFile = fakes.project({
      'pyrightconfig.json': '{}',
      'pyproject.toml': '[tool.pyright]\n',
    });
    const withSection = fakes.project({ 'pyproject.toml': '[tool.pyright]\nreportX = false\n' });
    const without = fakes.project({ 'pyproject.toml': '[tool.black]\n' });
    const configOf = (root) => pyrightConfig(fakes.contextFor(root).context);

    expect(configOf(withFile).extends).toBe(path.join(withFile, 'pyrightconfig.json'));
    expect(configOf(withSection).extends).toBe(path.join(withSection, 'pyproject.toml'));
    expect(configOf(without)).not.toHaveProperty('extends');
  });

  it('checks every source root, resolving packages from their parent', () => {
    const root = fakes.project({ 'pkg/__init__.py': '' });
    const { context, reportRoot } = fakes.contextFor(root, { sourceRoots: ['pkg', 'src'] });

    expect(pyrightConfig(context)).toMatchObject({
      include: [
        path.relative(reportRoot, path.join(root, 'pkg')),
        path.relative(reportRoot, path.join(root, 'src')),
      ],
      extraPaths: [root, path.join(root, 'src')],
    });
  });
});
