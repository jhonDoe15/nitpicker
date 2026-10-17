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
import { installFakeToolchain } from '../test-support/fake-toolchain.mjs';
import {
  ensureMutmutConfiguration,
  MUTATION_FAILED_RULE,
  MUTATION_SKIPPED_RULE,
  mutationFindings,
} from './python-mutation.mjs';
import { createToolContext } from '../python-tools.mjs';

const roots = [];
const savedEnvironment = new Map();

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-mutation-')));
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

function write(root, files) {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
}

function configurationContext(files = {}, overrides = {}) {
  const projectRoot = temporaryRoot();
  write(projectRoot, files);
  return { projectRoot, project: { sourceRoots: ['src'] }, ...overrides };
}

const TEST_PATTERNS =
  '"tests/*","test/*","*/tests/*","*/test/*","test_*.py","*/test_*.py","*_test.py","conftest.py","*/conftest.py"';
const section = (sourcePaths, patterns = TEST_PATTERNS) =>
  `[tool.mutmut]\nsource_paths = ${sourcePaths}\ndo_not_mutate = [${patterns}]\n`;

const read = (root, file) => readFileSync(path.join(root, file), 'utf8');

describe('the mutmut configuration', () => {
  it('adds the source roots and the test patterns when the project has no mutmut configuration', () => {
    const context = configurationContext({ 'pyproject.toml': '[project]\nname = "demo"\n' });

    ensureMutmutConfiguration(context);

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(
      `[project]\nname = "demo"\n\n${section('["src"]')}`,
    );
  });

  it('keeps mutmut away from the Django test module names in a Django project', () => {
    const context = configurationContext({ 'manage.py': '' });

    ensureMutmutConfiguration(context);

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(
      `\n${section('["src"]', `${TEST_PATTERNS},"*_tests.py","tests.py","*/tests.py","tests_*.py","*/tests_*.py"`)}`,
    );
  });

  it('creates pyproject.toml when the project has none', () => {
    const context = configurationContext({}, { project: { sourceRoots: ['pkg', 'lib'] } });

    ensureMutmutConfiguration(context);

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(`\n${section('["pkg","lib"]')}`);
  });

  it('keeps mutmut away from the excluded paths, the files and the directories below them', () => {
    const context = configurationContext(
      {},
      { exclude: ['legacy/**', 'src/demo/old.py', 'vendor/'] },
    );

    ensureMutmutConfiguration(context);

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(
      `\n${section('["src"]', `${TEST_PATTERNS},"legacy/**","legacy/**/*","src/demo/old.py","src/demo/old.py/*","vendor/","vendor/*"`)}`,
    );
  });

  it('keeps the [tool.mutmut] table of the project', () => {
    const own = '[tool.mutmut]\nsource_paths = ["app"]\n';
    const context = configurationContext({ 'pyproject.toml': own }, { exclude: ['legacy/**'] });

    ensureMutmutConfiguration(context);

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(own);
  });

  it('keeps the [mutmut] section of setup.cfg', () => {
    const context = configurationContext({ 'setup.cfg': '[mutmut]\nsource_paths=app\n' });

    ensureMutmutConfiguration(context);

    expect(existsSync(path.join(context.projectRoot, 'pyproject.toml'))).toBe(false);
  });

  it('asks for the directories to mutate instead of copying the whole project', () => {
    const context = configurationContext({}, { project: { sourceRoots: ['.'] } });

    expect(() => {
      ensureMutmutConfiguration(context);
    }).toThrow(
      /set "python.sourceRoots" in nitpicker.config.json or source_paths in \[tool.mutmut\]/,
    );
  });
});

const MUTATED =
  'def x_value__mutmut_orig():\n    return 1\n\n\ndef x_value__mutmut_1():\n    return 2\n\n\ndef x_value__mutmut_2():\n    return 3\n';

function mutantsData(...exitCodes) {
  return JSON.stringify({
    'src/demo/a.py': {
      exitCodes: Object.fromEntries(
        exitCodes.map((code, index) => [`demo.a.x_value__mutmut_${String(index + 1)}`, code]),
      ),
      mutated: MUTATED,
    },
  });
}

function project(files = {}) {
  const root = temporaryRoot();
  installFakeToolchain(path.join(root, '.venv/bin'));
  write(root, { 'src/demo/a.py': 'def value():\n    return 1\n', ...files });
  return root;
}

function contextFor(root, overrides = {}) {
  return createToolContext({
    projectRoot: root,
    liveRoot: root,
    reportRoot: temporaryRoot(),
    ...overrides,
  });
}

function callsLog() {
  const log = path.join(temporaryRoot(), 'calls.jsonl');
  writeFileSync(log, '');
  setEnvironment('FAKE_PYTHON_LOG', log);
  return () =>
    readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
}

const mutmutCalls = (calls) => calls().filter(({ tool }) => tool === 'mutmut');
const summaries = (findings) =>
  findings
    .filter(({ rule }) => rule === 'mutation-summary')
    .map(({ identity, metric }) => `${identity}=${String(metric.value)}`);

describe('running mutmut', () => {
  it('turns what mutmut left in mutants/ into findings and cleans the head snapshot', () => {
    const root = project({ 'mutants-data.json': mutantsData(0, 1) });

    const findings = mutationFindings(contextFor(root));

    expect(findings.filter(({ rule }) => rule === 'mutant-survived')).toEqual([
      {
        tool: 'mutmut',
        rule: 'mutant-survived',
        path: 'src/demo/a.py',
        identity: 'value|1→2#1',
        message:
          'Survived number: replacing `1` with `2` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        classification: 'enforceable',
        symbol: 'value',
        location: { line: 2 },
      },
    ]);
    expect(summaries(findings)).toEqual(['status:Survived=1', 'status:Killed=1']);
    expect(existsSync(path.join(root, 'mutants'))).toBe(false);
    expect(read(root, 'pyproject.toml')).toBe(`\n${section('["src"]')}`);
  });

  it('runs mutmut once, from the snapshot, with the snapshot sources first on PYTHONPATH', () => {
    const calls = callsLog();
    const root = project();

    mutationFindings(contextFor(root));

    expect(mutmutCalls(calls)).toEqual([
      {
        tool: 'mutmut',
        args: ['run'],
        cwd: root,
        pythonPath: path.join(root, 'src'),
      },
    ]);
  });

  it('keeps mutants/ of a base snapshot for the head run', () => {
    const root = project({ 'mutants-data.json': mutantsData(0) });

    mutationFindings(contextFor(root, { snapshot: 'base' }));

    expect(existsSync(path.join(root, 'mutants/src/demo/a.py.meta'))).toBe(true);
  });

  it('removes mutants/ of a head snapshot even when the run failed', () => {
    const root = project({ 'mutants-data.json': mutantsData(0), 'mutmut-exit.txt': '2\n' });

    expect(() => mutationFindings(contextFor(root))).toThrow();

    expect(existsSync(path.join(root, 'mutants'))).toBe(false);
  });

  it('starts from scratch even if the snapshot holds an old mutants/', () => {
    const root = project({ 'mutants/stale.meta': '{}' });

    expect(mutationFindings(contextFor(root))).toEqual([]);
  });

  it('runs mutmut single-process when pytest has xdist, since mutmut cannot take the -n of the ini addopts', () => {
    const calls = callsLog();
    const root = project({ 'xdist.txt': '' });

    mutationFindings(contextFor(root));

    expect(mutmutCalls(calls)[0].pytestAddopts).toBe('-n0');
  });

  it('keeps the PYTEST_ADDOPTS of the caller, without the options that let a failing run pass, and puts -n0 after them', () => {
    const calls = callsLog();
    setEnvironment('PYTEST_ADDOPTS', undefined);
    const root = project({ 'xdist.txt': '' });

    mutationFindings(contextFor(root, { pytestAddopts: '-x --lf' }));

    expect(mutmutCalls(calls)[0].pytestAddopts).toBe('--lf -n0');
  });

  it('leaves PYTEST_ADDOPTS alone without xdist', () => {
    const calls = callsLog();
    setEnvironment('PYTEST_ADDOPTS', undefined);
    const root = project();

    mutationFindings(contextFor(root));

    expect(mutmutCalls(calls)[0].pytestAddopts).toBeUndefined();
  });

  it('does not run on Windows and says so with a descriptive note', () => {
    const calls = callsLog();
    const root = project();

    expect(mutationFindings(contextFor(root), 'win32')).toEqual([
      {
        tool: 'mutmut',
        rule: MUTATION_SKIPPED_RULE,
        path: '.',
        identity: 'windows',
        message:
          'Mutation testing was skipped: mutmut needs POSIX fork and does not run on native Windows. Run nitpicker inside WSL to enable it. To run without mutation testing, add "mutation" to "disable" in nitpicker.config.json.',
        classification: 'descriptive',
      },
    ]);
    expect(calls()).toEqual([]);
  });

  it('reports a mutmut run that fails as a mutation failure with its output', () => {
    const root = project({ 'mutants-data.json': mutantsData(0), 'mutmut-exit.txt': '2\n' });

    expect(() => mutationFindings(contextFor(root))).toThrow(
      expect.objectContaining({
        rule: MUTATION_FAILED_RULE,
        message: 'mutmut run exited 2 in the virtualenv environment:\nFailed to run clean test',
      }),
    );
  });

  it('points to also_copy when mutmut cannot collect its stats', () => {
    const root = project({
      'mutmut-exit.txt': '1\n',
      'mutmut-output.txt':
        'FileNotFoundError: data.txt\nfailed to collect stats. runner returned 1\n',
    });

    expect(() => mutationFindings(contextFor(root))).toThrow(
      expect.objectContaining({
        rule: MUTATION_FAILED_RULE,
        message:
          'mutmut run exited 1 in the virtualenv environment:\nFileNotFoundError: data.txt\nfailed to collect stats. runner returned 1\nIf the tests read files outside the source roots, list them under "also_copy" in [tool.mutmut] of pyproject.toml.',
      }),
    );
  });

  it('reports nothing when the tests collected no test, which the python analyzer already flags', () => {
    const root = project({
      'mutants-data.json': mutantsData(null),
      'mutmut-exit.txt': '1\n',
      'mutmut-output.txt': 'no tests ran in 0.08s\nfailed to collect stats. runner returned 5\n',
    });

    expect(mutationFindings(contextFor(root))).toEqual([]);
  });

  it('counts every mutant as uncovered when mutmut finds no test for any of them', () => {
    const root = project({
      'mutants-data.json': mutantsData(null, null),
      'mutmut-exit.txt': '1\n',
    });

    const findings = mutationFindings(contextFor(root));

    expect(findings.filter(({ rule }) => rule === 'mutant-nocoverage')).toHaveLength(2);
    expect(summaries(findings)).toEqual(['status:NoCoverage=2']);
  });

  it('says where mutmut should be installed and how to turn mutation testing off', () => {
    const root = project({ 'no-mutmut.txt': '' });

    expect(() => mutationFindings(contextFor(root))).toThrow(
      expect.objectContaining({
        rule: MUTATION_FAILED_RULE,
        message:
          'mutmut was not found in the virtualenv environment: install it there (for example as a dev dependency), or set "python.environment" to the environment that has it. To run without mutation testing, add "mutation" to "disable" in nitpicker.config.json.',
      }),
    );
  });

  it.each(['2.3.1', '4.0.0'])('refuses mutmut %s, which it cannot read', (version) => {
    const calls = callsLog();
    const root = project({ 'mutmut-version.txt': version });

    expect(() => mutationFindings(contextFor(root))).toThrow(
      expect.objectContaining({
        rule: MUTATION_FAILED_RULE,
        message: `mutmut ${version} is not supported: nitpicker reads the run data of mutmut 3.x. To run without mutation testing, add "mutation" to "disable" in nitpicker.config.json.`,
      }),
    );
    expect(mutmutCalls(calls)).toEqual([]);
  });

  it('accepts any 3.x release', () => {
    const root = project({ 'mutmut-version.txt': '3.12.0rc1' });

    expect(mutationFindings(contextFor(root))).toEqual([]);
  });

  it('reports a mutmut that left no mutants directory', () => {
    const root = project();
    writeFileSync(path.join(root, '.venv/bin/mutmut'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    expect(() => mutationFindings(contextFor(root))).toThrow(
      'mutmut finished without writing a mutants directory',
    );
  });
});
