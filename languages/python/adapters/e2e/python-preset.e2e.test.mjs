import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  writeFileSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  cpSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { runCli } from '../../../../core/cli.mjs';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import {
  GREETER_HI,
  GREETER_HI_TEST,
  LEGACY_MOVED,
  VIOLATION,
  TYPE_ERROR,
  ONE_WAY_VIOLATIONS,
  WEAKENED_MYPY,
  WEAKENED_PYRIGHT,
  HIDDEN_ERROR,
  LEGACY_WEAKER,
  PRICING_WITH_UNUSED,
  PRICING_TEST,
  PRICING,
  PRICING_FULL_TEST,
} from '../fixtures/python-preset-data.mjs';

// End-to-end test of the Python preset on a small project with real tools. It needs python3, uv,
// ruff, pyright and network access to PyPI (it installs pytest, coverage and mypy into throwaway
// environments), so it only runs with NITPICKER_PYTHON_E2E=1 (`npm run test:python`).

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';

export const fixture = path.resolve(
  new URL('../', import.meta.url).pathname,
  'fixtures/python-project',
);

const gitEnvironment = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

function command(cwd, program, args) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', env: gitEnvironment });
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(' ')} failed: ${result.stderr}${result.stdout}`);
  }
}

function git(root, ...args) {
  command(root, 'git', args);
}

function write(root, files) {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
}

function commitBranch(root, name, files) {
  git(root, 'checkout', '-q', '-b', name, 'main');
  write(root, files);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', name);
}

function gate(root, branch, extra = []) {
  git(root, 'checkout', '-q', branch);
  const reports = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-e2e-out-'));
  const output = { text: '' };
  const exitCode = runCli({
    arguments_: ['--base', 'main', '--output', reports, ...extra],
    environment: { NO_COLOR: '1' },
    currentProjectRoot: root,
    stdout: {
      write: (value) => {
        output.text += value;
      },
    },
    stderr: {
      write: (value) => {
        output.text += value;
      },
    },
    progress: { write: () => undefined },
  });
  const json = (name) => JSON.parse(readFileSync(path.join(reports, name), 'utf8'));
  return { exitCode, json, text: output.text, reports };
}

const enforceable = (result) =>
  summarize(
    result
      .json('new-findings.json')
      .filter(({ classification }) => classification === 'enforceable'),
  );

const withoutMutants = (summaries) => summaries.filter((summary) => !summary.startsWith('mutmut '));

const summarize = (findings) =>
  findings.map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`).sort();

const roots = [];

function repository() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-e2e-')));
  roots.push(root);
  return root;
}

describe.skipIf(!enabled)('Python preset end to end', () => {
  let project;
  beforeAll(() => {
    project = repository();
    cpSync(fixture, project, { recursive: true });
    git(project, 'init', '-q', '-b', 'main');
    git(project, 'add', '-A');
    git(project, 'commit', '-q', '-m', 'base with one legacy violation');
    command(project, 'uv', ['venv', '-q', '.venv']);
    command(project, 'uv', [
      'pip',
      'install',
      '-q',
      '--python',
      '.venv',
      '-e',
      '.',
      'coverage',
      'mutmut',
      'pytest',
      'mypy',
    ]);
    commitBranch(project, 'clean', {
      'src/demo/greeter.py': GREETER_HI,
      'tests/test_greeter.py': GREETER_HI_TEST,
    });
    commitBranch(project, 'moved', { 'src/demo/legacy.py': LEGACY_MOVED });
    commitBranch(project, 'violation', { 'src/demo/bad.py': VIOLATION });
    commitBranch(project, 'type-error', { 'src/demo/typed.py': TYPE_ERROR });
    commitBranch(project, 'one-way', { 'src/demo/rules.py': ONE_WAY_VIOLATIONS });
    commitBranch(project, 'excepted', {
      'src/demo/rules.py': ONE_WAY_VIOLATIONS,
      'nitpicker.config.json': JSON.stringify({
        preset: 'python',
        disable: ['mutation'],
        python: {
          exceptions: [
            { rule: 'PTH118', paths: ['src/demo/rules.py'], reason: 'fixture' },
            { rule: 'frozen-dataclass', paths: ['src/demo/*.py'], reason: 'fixture' },
            { rule: 'no-inline-suppression', paths: ['src/**'], reason: 'fixture' },
          ],
        },
      }),
    });
    commitBranch(project, 'pyright', {
      'src/demo/typed.py': TYPE_ERROR,
      'pyrightconfig.json': '{}\n',
    });
    commitBranch(project, 'weakened-mypy', {
      'src/demo/typed.py': TYPE_ERROR,
      'pyproject.toml': WEAKENED_MYPY,
    });
    commitBranch(project, 'weakened-pyright', {
      'src/demo/typed.py': TYPE_ERROR,
      'pyrightconfig.json': `${WEAKENED_PYRIGHT}\n`,
    });
    commitBranch(project, 'hidden-from-types', { 'src/demo/hidden.py': HIDDEN_ERROR });
    commitBranch(project, 'weaker-source', { 'src/demo/legacy.py': LEGACY_WEAKER });
    commitBranch(project, 'survivors', {
      'src/demo/pricing.py': PRICING_WITH_UNUSED,
      'tests/test_pricing.py': PRICING_TEST,
    });
    commitBranch(project, 'killed', {
      'src/demo/pricing.py': PRICING,
      'tests/test_pricing.py': PRICING_FULL_TEST,
    });
    commitBranch(project, 'failing-tests', {
      'tests/test_greeter.py': GREETER_HI_TEST,
    });
    commitBranch(project, 'broken-environment', {
      'nitpicker.config.json': '{ "preset": "python", "python": { "environment": "nowhere" } }\n',
    });
  });
  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('passes a change that alters behaviour: base tests run against base code, not the editable head install', () => {
    const result = gate(project, 'clean');

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('summary.json').overallStatus).toBe('completed');
    const [python, mutation] = result.json('summary.json').tools;
    expect(python.version).toMatch(
      /^ruff@[\d.]+;mypy@[\d.]+;coverage@[\d.]+;pytest@[\d.]+;jscpd@[\d.]+$/,
    );
    expect(mutation.version).toMatch(/^mutmut@3\.[\d.]+;pytest@[\d.]+$/);
    expect(python.unchanged).toBeGreaterThan(0);
  });
  it('keeps the legacy violation baselined when its line moves', () => {
    const result = gate(project, 'moved');

    expect(result.exitCode, result.text).toBe(0);
    expect(
      summarize(result.json('new-findings.json').filter(({ tool }) => tool !== 'coverage')),
    ).toEqual([]);
  });
  it('fails a new lint violation and a new unformatted file in every report format', () => {
    const result = gate(project, 'violation');

    expect(result.exitCode, result.text).toBe(1);
    expect(
      summarize(
        result
          .json('new-findings.json')
          .filter(({ classification }) => classification === 'enforceable'),
      ),
    ).toEqual([
      'mutmut mutant-nocoverage bad.py',
      'mypy no-untyped-def bad.py',
      'ruff F401 bad.py',
      'ruff-format format bad.py',
    ]);
    const sarif = JSON.parse(readFileSync(path.join(result.reports, 'report.sarif'), 'utf8'));
    expect(sarif.runs[0].results.map(({ ruleId }) => ruleId)).toEqual([
      'coupling/module-coupling',
      'coupling/module-coupling',
      'coupling/module-coupling',
      'coverage/line-coverage',
      'coverage/uncovered-function',
      'mutmut/mutant-nocoverage',
      'mypy/no-untyped-def',
      'ruff/F401',
      'ruff-format/format',
    ]);
    expect(readFileSync(path.join(result.reports, 'report.junit.xml'), 'utf8')).toMatch(/F401/);
    expect(result.text).toMatch(/ruff\/F401 src\/demo\/bad\.py:1\n/);
  });
  it('fails a new type error found by mypy, strict by default, and keeps the legacy ones baselined', () => {
    const result = gate(project, 'type-error');

    expect(result.exitCode, result.text).toBe(1);
    expect(withoutMutants(enforceable(result))).toEqual(['mypy return-value typed.py']);
    expect(result.text).toMatch(/Fix the type; inline ignores are banned/);
  });
  it('fails the one-way rules, each message naming the allowed form', () => {
    const result = gate(project, 'one-way');

    expect(result.exitCode, result.text).toBe(1);
    expect(withoutMutants(enforceable(result))).toEqual([
      'python-rules frozen-dataclass rules.py',
      'python-rules no-inline-suppression rules.py',
      'ruff PTH118 rules.py',
    ]);
    expect(result.text).toMatch(/Declare records as `@dataclass\(frozen=True\)`/);
    expect(result.text).toMatch(/Use `pathlib\.Path`/);
    expect(result.text).toMatch(/Remove the comment and fix the code/);
    expect(result.text).toMatch(/entry for PTH118 in nitpicker\.config\.json/);
  });
  it('passes the same code when python.exceptions lifts its rules', () => {
    const result = gate(project, 'excepted');

    expect(result.exitCode, result.text).toBe(0);
    expect(withoutMutants(enforceable(result))).toEqual([]);
    expect(result.json('summary.json').configOverrides).toEqual([
      'preset: "python"',
      'disable: ["mutation"]',
      'exception: {"rule":"PTH118","paths":["src/demo/rules.py"],"reason":"fixture"}',
      'exception: {"rule":"frozen-dataclass","paths":["src/demo/*.py"],"reason":"fixture"}',
      'exception: {"rule":"no-inline-suppression","paths":["src/**"],"reason":"fixture"}',
    ]);
  });
  it('runs pyright when the project has a pyright config, in its strict mode', () => {
    const result = gate(project, 'pyright');

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('summary.json').tools[0].version).toMatch(
      /^ruff@[\d.]+;pyright@[\d.]+;coverage@[\d.]+;pytest@[\d.]+;jscpd@[\d.]+$/,
    );
    expect(withoutMutants(enforceable(result))).toEqual(['pyright reportReturnType typed.py']);
  });
  it('keeps checking when the project config switches mypy off for the file', () => {
    const result = gate(project, 'weakened-mypy');

    expect(result.exitCode, result.text).toBe(1);
    expect(withoutMutants(enforceable(result))).toEqual(['mypy return-value typed.py']);
  });
  it('keeps checking when the project config ignores or excludes the file in pyright', () => {
    const result = gate(project, 'weakened-pyright');

    expect(result.exitCode, result.text).toBe(1);
    expect(withoutMutants(enforceable(result))).toEqual(['pyright reportReturnType typed.py']);
  });
  it('fails code hidden from the checkers with @no_type_check', () => {
    const result = gate(project, 'hidden-from-types');

    expect(result.exitCode, result.text).toBe(1);
    expect(withoutMutants(enforceable(result))).toEqual(['python-rules no-type-check hidden.py']);
    expect(result.text).toMatch(/Remove the decorator and annotate the code/);
  });
  it('fails new surviving and uncovered mutants but not the legacy survivors of the base', () => {
    const result = gate(project, 'survivors');

    expect(result.exitCode, result.text).toBe(1);
    const mutants = result
      .json('new-findings.json')
      .filter(({ tool, rule }) => tool === 'mutmut' && rule !== 'mutation-summary');
    expect(new Set(mutants.map(({ rule }) => rule))).toEqual(
      new Set(['mutant-survived', 'mutant-nocoverage']),
    );
    expect(new Set(mutants.map(({ path: file }) => file))).toEqual(
      new Set(['src/demo/pricing.py']),
    );
    expect(mutants.find(({ rule }) => rule === 'mutant-survived')).toEqual({
      tool: 'mutmut',
      rule: 'mutant-survived',
      path: 'src/demo/pricing.py',
      identity: 'discount|-→+#1',
      message:
        'Survived operator: replacing `-` with `+` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
      classification: 'enforceable',
      symbol: 'discount',
      location: { line: 2 },
    });
  });
  it('passes new code whose mutants are all killed', () => {
    const result = gate(project, 'killed');

    expect(result.exitCode, result.text).toBe(0);
    expect(
      result
        .json('new-findings.json')
        .filter(({ tool, rule }) => tool === 'mutmut' && rule !== 'mutation-summary'),
    ).toEqual([]);
  });
  it('reuses the base mutants for a source-only change and still fails a new survivor', () => {
    const result = gate(project, 'weaker-source');

    expect(result.exitCode, result.text).toBe(1);
    expect(
      result
        .json('new-findings.json')
        .filter(({ classification }) => classification === 'enforceable')
        .map(({ tool, rule, symbol }) => `${tool} ${rule} ${symbol}`),
    ).toEqual(['mutmut mutant-survived value']);
  });
});
