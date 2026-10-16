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
  MUTATION_FAILED_RULE,
  MUTATION_SKIPPED_RULE,
  mutationFindings,
} from './python-mutation.mjs';
import { createToolContext } from '../python-tools.mjs';
import { writeMutmutConfig } from '../project-tools/mutmut/mutmut-config.mjs';

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
  return { projectRoot, project: { sourceRoots: ['src'] }, exclude: [], ...overrides };
}

const TEST_PATTERNS =
  '"tests/*","test/*","*/tests/*","*/test/*","test_*.py","*/test_*.py","*_test.py","conftest.py","*/conftest.py"';
const section = (sourcePaths, patterns = TEST_PATTERNS) =>
  `[tool.mutmut]\nsource_paths = ${sourcePaths}\ndo_not_mutate = [${patterns}]\n`;

const read = (root, file) => readFileSync(path.join(root, file), 'utf8');

const failure = (message) => new Error(message);
const ensureMutmutConfiguration = (context) => {
  writeMutmutConfig({ context, fail: failure });
};
const LISTED = { mutmut: ['project', 'nitpicker'] };

describe('the mutmut configuration', () => {
  it('adds the source roots and the test patterns when the project has no mutmut configuration', () => {
    const context = configurationContext({ 'pyproject.toml': '[project]\nname = "demo"\n' });

    ensureMutmutConfiguration(context);

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(
      `[project]\nname = "demo"\n\n${section('["src"]')}`,
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

  it('replaces the [tool.mutmut] table of the project, keeping only what the run needs', () => {
    const own = [
      '[project]',
      'name = "demo"',
      '',
      '[tool.mutmut]',
      'source_paths = ["app"]',
      'do_not_mutate = ["src/*"]',
      'only_mutate = ["src/a.py"]',
      'also_copy = ["data/"]',
      'process_isolation = "forkserver"',
      'max_stack_depth = 3',
      'mutate_only_covered_lines = true',
      '',
      '[tool.ruff]',
      'line-length = 100',
      '',
    ].join('\n');
    const context = configurationContext({ 'pyproject.toml': own });

    ensureMutmutConfiguration(context);

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(
      [
        '[project]',
        'name = "demo"',
        '',
        '[tool.ruff]',
        'line-length = 100',
        '',
        `${section('["src"]').trimEnd()}`,
        'also_copy = ["data/"]',
        'process_isolation = "forkserver"',
        '',
      ].join('\n'),
    );
  });

  it('takes also_copy from the setup.cfg section and puts nitpicker section in pyproject.toml', () => {
    const context = configurationContext({
      'setup.cfg':
        '[mutmut]\nsource_paths=app\nalso_copy=\n  data/\n  fixtures/\ndo_not_mutate=src/*\n',
    });

    ensureMutmutConfiguration(context);

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(
      `\n${section('["src"]').trimEnd()}\nalso_copy = ["data/","fixtures/"]\n`,
    );
  });

  it('asks for the directories to mutate when neither nitpicker nor the project names them', () => {
    const context = configurationContext({}, { project: { sourceRoots: ['.'] } });

    expect(() => {
      ensureMutmutConfiguration(context);
    }).toThrow(
      /set "python.sourceRoots" in nitpicker.config.json or source_paths in \[tool.mutmut\]/,
    );
  });

  it('takes the source paths from the project when the source roots are the whole project', () => {
    const context = configurationContext(
      { 'pyproject.toml': '[tool.mutmut]\npaths_to_mutate = ["app"]\ndo_not_mutate = ["app/*"]\n' },
      { project: { sourceRoots: ['.'] } },
    );

    ensureMutmutConfiguration(context);

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(`\n${section('["app"]')}`);
  });
});

describe('the mutmut configuration with tools.mutmut listing the project', () => {
  const policy = (context) => ({ toolPrecedence: LISTED, policyRoot: context.projectRoot });

  it('lets the project override the keys it sets and keeps the test patterns', () => {
    const own = [
      '[tool.mutmut]',
      'source_paths = ["app"]',
      'do_not_mutate = ["app/generated/*"]',
      'mutate_only_covered_lines = true',
      'timeout_multiplier = 3',
      '',
    ].join('\n');
    const context = configurationContext({ 'pyproject.toml': own }, { exclude: ['legacy/**'] });

    ensureMutmutConfiguration({ ...context, ...policy(context) });

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(
      `\n${section(
        '["app"]',
        `${TEST_PATTERNS},"legacy/**","legacy/**/*","app/generated/*"`,
      ).trimEnd()}\nmutate_only_covered_lines = true\ntimeout_multiplier = 3\n`,
    );
  });

  it('reads the setup.cfg section with typed values', () => {
    const context = configurationContext({
      'setup.cfg': '[mutmut]\nmutate_only_covered_lines=true\ntimeout_multiplier=2.5\n',
    });

    ensureMutmutConfiguration({ ...context, ...policy(context) });

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(
      `\n${section('["src"]').trimEnd()}\nmutate_only_covered_lines = true\ntimeout_multiplier = 2.5\n`,
    );
  });

  it('keeps the isolated configuration when nitpicker is listed first', () => {
    const context = configurationContext({
      'pyproject.toml': '[tool.mutmut]\nonly_mutate = ["src/a.py"]\nalso_copy = ["data/"]\n',
    });

    ensureMutmutConfiguration({
      ...context,
      toolPrecedence: { mutmut: ['nitpicker', 'project'] },
      policyRoot: context.projectRoot,
    });

    expect(read(context.projectRoot, 'pyproject.toml')).toBe(
      `\n${section('["src"]').trimEnd()}\nalso_copy = ["data/"]\n`,
    );
  });

  it('names the missing config', () => {
    const context = configurationContext({});

    expect(() => {
      ensureMutmutConfiguration({ ...context, ...policy(context) });
    }).toThrow(/^"tools\.mutmut\.precedence" lists "project" but a mutmut config .+ is missing/u);
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

  it('keeps the PYTEST_ADDOPTS of the caller and puts -n0 after them', () => {
    const calls = callsLog();
    setEnvironment('PYTEST_ADDOPTS', '-x --lf');
    const root = project({ 'xdist.txt': '' });

    mutationFindings(contextFor(root));

    expect(mutmutCalls(calls)[0].pytestAddopts).toBe('-x --lf -n0');
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
