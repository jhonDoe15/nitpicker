import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureMutmutConfiguration,
  MUTATION_FAILED_RULE,
  runMutation,
} from './python-mutation.mjs';

const roots = [];

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-mutation-')));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function write(root, files) {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
}

function contextOf(files = {}, overrides = {}) {
  const projectRoot = temporaryRoot();
  write(projectRoot, files);
  return {
    projectRoot,
    reportRoot: temporaryRoot(),
    snapshot: 'head',
    project: { sourceRoots: ['src'] },
    ...overrides,
  };
}

const section = (sourcePaths) =>
  `[tool.mutmut]\nsource_paths = ${sourcePaths}\ndo_not_mutate = ["tests/*","test/*","*/tests/*","*/test/*","test_*.py","*/test_*.py","*_test.py","conftest.py","*/conftest.py"]\n`;

const read = (root, file) => readFileSync(path.join(root, file), 'utf8');

function leaveMutants(context, exitCodes = { 'm.x_f__mutmut_1': 1 }) {
  write(context.projectRoot, {
    'mutants/src/m.py.meta': JSON.stringify({ exit_code_by_key: exitCodes }),
    'mutants/src/m.py': 'def x_f__mutmut_orig():\n    return 1\n',
    'src/m.py': 'def f():\n    return 1\n',
  });
}

describe('the mutmut configuration', () => {
  it('adds the source roots and the test patterns when the project has no mutmut configuration', () => {
    const context = contextOf({ 'pyproject.toml': '[project]\nname = "demo"\n' });

    ensureMutmutConfiguration(context);

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(
      `[project]\nname = "demo"\n\n${section('["src"]')}`,
    );
  });

  it('creates pyproject.toml when the project has none', () => {
    const context = contextOf({}, { project: { sourceRoots: ['pkg', 'lib'] } });

    ensureMutmutConfiguration(context);

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(`\n${section('["pkg","lib"]')}`);
  });

  it('keeps the [tool.mutmut] table of the project', () => {
    const own = '[tool.mutmut]\nsource_paths = ["app"]\n';
    const context = contextOf({ 'pyproject.toml': own });

    ensureMutmutConfiguration(context);

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(own);
  });

  it('keeps the [mutmut] section of setup.cfg', () => {
    const context = contextOf({ 'setup.cfg': '[mutmut]\nsource_paths=app\n' });

    ensureMutmutConfiguration(context);

    expect(existsSync(path.join(context.projectRoot, 'pyproject.toml'))).toBe(false);
  });

  it('asks for the directories to mutate instead of copying the whole project', () => {
    const context = contextOf({}, { project: { sourceRoots: ['.'] } });

    expect(() => {
      ensureMutmutConfiguration(context);
    }).toThrow(
      /set "python.sourceRoots" in nitpicker.config.json or source_paths in \[tool.mutmut\]/,
    );
  });
});

describe('running mutmut', () => {
  function fakeRun(context, { status = 0, output = '' } = {}) {
    const calls = [];
    const run = (runContext, command, options) => {
      calls.push({
        command,
        options,
        stale: existsSync(path.join(context.projectRoot, 'mutants')),
      });
      leaveMutants(context, { 'm.x_f__mutmut_1': 0, 'm.x_f__mutmut_2': null });
      return { status, stdout: output, stderr: '' };
    };
    return { run, calls };
  }

  it('does not run on Windows and says to use WSL', () => {
    const context = contextOf();
    const { run, calls } = fakeRun(context);

    expect(() => {
      runMutation(context, run, 'win32');
    }).toThrow('mutmut needs POSIX fork and does not run on Windows: run nitpicker inside WSL');
    expect(calls).toEqual([]);
  });

  it('marks the failure as a mutation failure', () => {
    const context = contextOf();

    expect(() => {
      runMutation(context, () => ({}), 'win32');
    }).toThrow(expect.objectContaining({ rule: MUTATION_FAILED_RULE }));
  });

  it('runs mutmut from scratch, writes its run data to the report directory and removes mutants/ on head', () => {
    const context = contextOf({ 'mutants/stale.meta': '{}' });
    const { run, calls } = fakeRun(context);

    runMutation(context, run, 'linux');

    expect(calls).toEqual([
      {
        command: ['mutmut', 'run'],
        options: {
          accepted: expect.any(Function),
          rule: 'mutation-failed',
          timeoutMs: 60 * 60 * 1000,
        },
        stale: false,
      },
    ]);
    const data = JSON.parse(read(context.reportRoot, 'mutation.json'));
    expect(data.files).toEqual([
      {
        path: 'src/m.py',
        exitCodes: { 'm.x_f__mutmut_1': 0, 'm.x_f__mutmut_2': null },
        mutated: 'def x_f__mutmut_orig():\n    return 1\n',
        original: 'def f():\n    return 1\n',
      },
    ]);
    expect(existsSync(path.join(context.projectRoot, 'mutants'))).toBe(false);
  });

  it('keeps mutants/ on base so that head can reuse the results', () => {
    const context = contextOf({}, { snapshot: 'base' });
    const { run } = fakeRun(context);

    runMutation(context, run, 'linux');

    expect(existsSync(path.join(context.projectRoot, 'mutants/src/m.py.meta'))).toBe(true);
  });

  it('accepts a finished run and a run that found no covered mutant, and nothing else', () => {
    const context = contextOf();
    const { run, calls } = fakeRun(context);
    runMutation(context, run, 'linux');
    const { accepted } = calls[0].options;

    expect(accepted({ status: 0, stdout: '', stderr: '' })).toBe(true);
    expect(accepted({ status: 1, stdout: '', stderr: 'Failed to run clean test' })).toBe(false);
    expect(
      accepted({
        status: 1,
        stdout: 'Stopping early, because we could not find any test case for any mutant.',
        stderr: '',
      }),
    ).toBe(true);
    expect(
      accepted({
        status: 1,
        stdout: '',
        stderr: 'Stopping early, because we could not find any test case for any mutant.',
      }),
    ).toBe(true);
    expect(
      accepted({ status: 2, stdout: 'could not find any test case for any mutant', stderr: '' }),
    ).toBe(false);
  });

  it('counts the mutants of a run that found no covered mutant as uncovered', () => {
    const context = contextOf();
    const { run } = fakeRun(context, { status: 1 });

    runMutation(context, run, 'linux');

    expect(JSON.parse(read(context.reportRoot, 'mutation.json')).files[0].exitCodes).toEqual({
      'm.x_f__mutmut_1': 0,
      'm.x_f__mutmut_2': 33,
    });
  });
});
