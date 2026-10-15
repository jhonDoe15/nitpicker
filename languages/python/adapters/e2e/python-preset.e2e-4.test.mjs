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
  LAYERED_FILES,
  ORDER_TOTAL,
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
  describe('a project whose mutmut configuration nitpicker writes, with xdist and an excluded Python 2 file', () => {
    let callers;
    beforeAll(() => {
      callers = repository();
      write(callers, {
        'nitpicker.config.json': '{ "preset": "python", "exclude": ["calc/legacy.py"] }\n',
        '.gitignore': '.venv/\n__pycache__/\n',
        'pyproject.toml':
          '[project]\nname = "calc"\nversion = "0.1.0"\n\n[tool.pytest.ini_options]\naddopts = "-n 2"\n',
        'calc/__init__.py': '',
        'calc/helper.py': 'def f(x):\n    return x + 2\n',
        'calc/core.py':
          'from calc.helper import f\n\n\ndef g(x):\n    return 1 if f(x) > 3 else 0\n',
        'calc/legacy.py': 'print "old"\n',
        'tests/test_core.py':
          'from calc.core import g\n\n\ndef test_low():\n    assert g(1) == 0\n\n\ndef test_high():\n    assert g(2) == 1\n',
      });
      git(callers, 'init', '-q', '-b', 'main');
      git(callers, 'add', '-A');
      git(callers, 'commit', '-q', '-m', 'base');
      command(callers, 'uv', ['venv', '-q', '.venv']);
      command(callers, 'uv', [
        'pip',
        'install',
        '-q',
        '--python',
        '.venv',
        'coverage',
        'mutmut',
        'pytest',
        'pytest-xdist',
      ]);
      commitBranch(callers, 'unrelated', { 'calc/extra.py': 'EXTRA = 1\n' });
      commitBranch(callers, 'callee', {
        'calc/helper.py': 'def f(x):\n    return x + 3 if x >= 2 else x + 1\n',
      });
    });
    it('runs mutmut despite xdist in the addopts and never mutates the excluded file', () => {
      const result = gate(callers, 'unrelated');

      expect(result.exitCode, result.text).toBe(0);
      expect(result.json('summary.json').overallStatus).toBe('completed');
    });
    it('does not reuse the results of an unchanged caller whose callee changed', () => {
      const result = gate(callers, 'callee');

      expect(result.exitCode, result.text).toBe(1);
      const survivors = result
        .json('new-findings.json')
        .filter(({ rule }) => rule === 'mutant-survived');
      expect(survivors.map(({ path: file, identity }) => `${file} ${identity}`).sort()).toEqual(
        [
          'calc/core.py g|>→>=#1',
          'calc/core.py g|3→4#1',
          'calc/helper.py f|+→-#1',
          'calc/helper.py f|1→2#1',
          'calc/helper.py f|3→4#1',
        ].sort(),
      );
    });
  });
  describe('a uv project', () => {
    let locked;
    beforeAll(() => {
      locked = repository();
      cpSync(fixture, locked, { recursive: true });
      command(locked, 'uv', ['lock', '-q']);
      command(locked, 'uv', ['sync', '-q']);
      git(locked, 'init', '-q', '-b', 'main');
      git(locked, 'add', '-A');
      git(locked, 'commit', '-q', '-m', 'base');
      commitBranch(locked, 'clean', {
        'src/demo/greeter.py': GREETER_HI,
        'tests/test_greeter.py': GREETER_HI_TEST,
      });
      commitBranch(locked, 'violation', { 'src/demo/bad.py': VIOLATION });
    });
    it('runs the tools through uv and passes a clean change', () => {
      const result = gate(locked, 'clean');

      expect(result.exitCode, result.text).toBe(0);
    });
    it('fails a new violation', () => {
      const result = gate(locked, 'violation');

      expect(result.exitCode, result.text).toBe(1);
    });
  });
});
describe.skipIf(!enabled)('Python duplicates, coupling and import contracts end to end', () => {
  let project;
  const enforceable = (result) =>
    result
      .json('new-findings.json')
      .filter(({ classification }) => classification === 'enforceable')
      .sort((left, right) =>
        `${left.tool}${left.identity}`.localeCompare(`${right.tool}${right.identity}`),
      );
  const newRules = (result) => enforceable(result).map(({ tool, rule }) => `${tool} ${rule}`);
  beforeAll(() => {
    project = repository();
    write(project, LAYERED_FILES);
    git(project, 'init', '-q', '-b', 'main');
    git(project, 'add', '-A');
    git(project, 'commit', '-q', '-m', 'layered base');
    command(project, 'uv', ['venv', '-q', '.venv']);
    command(project, 'uv', [
      'pip',
      'install',
      '-q',
      '--python',
      '.venv',
      'coverage',
      'pytest',
      'import-linter',
    ]);
    commitBranch(project, 'clean', {
      'src/shop/web/views.py': `${LAYERED_FILES['src/shop/web/views.py']}\n\ndef hide(amounts: list[float]) -> int:\n    return len(amounts)\n`,
    });
    commitBranch(project, 'copy', {
      'src/shop/domain/bulk.py': ORDER_TOTAL.replace('order_total', 'bulk_total'),
      'tests/test_bulk.py':
        'from shop.domain import bulk\n\n\ndef test_bulk_total():\n    assert bulk.bulk_total([(2, 3), (0, 1)], 5) == 1\n    assert bulk.bulk_total([(0, 1)], 5) == 0\n',
    });
    commitBranch(project, 'upward-import', {
      'src/shop/domain/pricing.py': `${LAYERED_FILES['src/shop/domain/pricing.py']}\n\ndef describe() -> str:\n    from shop.web import views\n\n    return views.show([1])\n`,
    });
    commitBranch(project, 'contracts-off', {
      'src/shop/domain/pricing.py': `${LAYERED_FILES['src/shop/domain/pricing.py']}\n\ndef describe() -> str:\n    from shop.web import views\n\n    return views.show([1])\n`,
      'nitpicker.config.json':
        '{ "preset": "python", "disable": ["mutation"], "python": { "importLinter": false } }\n',
    });
  });
  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('passes a change that keeps the layering and adds no copy', () => {
    const result = gate(project, 'clean');

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('summary.json').tools[0].version).toMatch(
      /;jscpd@[\d.]+;import-linter@[\d.]+$/,
    );
  });
  it('fails a copied function as a duplicate against the original', () => {
    const result = gate(project, 'copy');

    expect(result.exitCode, result.text).toBe(1);
    expect(
      enforceable(result).map(({ tool, rule, path: file, message }) => ({
        tool,
        rule,
        file,
        message,
      })),
    ).toEqual([
      {
        tool: 'duplicates',
        rule: 'duplicate-clone',
        file: 'src/shop/domain/bulk.py',
        message:
          'This code repeats src/shop/domain/pricing.py:5 (10 lines). Keep one copy and call it from both places. If the repetition is intended, add src/shop/domain/bulk.py to "exclude" in nitpicker.config.json.',
      },
    ]);
  });
});
