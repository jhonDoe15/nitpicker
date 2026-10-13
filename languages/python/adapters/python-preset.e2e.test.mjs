import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCli } from '../../../core/cli.mjs';

// End-to-end test of the Python preset on a small project with real tools. It needs python3, uv,
// ruff and network access to PyPI (it installs pytest and coverage into throwaway environments),
// so it only runs with NITPICKER_PYTHON_E2E=1 (`npm run test:python`).

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const fixture = path.resolve(import.meta.dirname, 'fixtures/python-project');

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

const summarize = (findings) =>
  findings.map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`).sort();

const VIOLATION = 'import sys\n\n\ndef f( a,b ):\n    return a+b\n';
const GREETER_HI = 'def greet(name):\n    return f"Hi, {name}!"\n';
const GREETER_HI_TEST =
  'from demo.greeter import greet\nfrom demo.legacy import clamp, value\n\n\ndef test_greet():\n    assert greet("Ada") == "Hi, Ada!"\n\n\ndef test_value():\n    assert value() == 1\n\n\ndef test_clamp():\n    assert clamp(3) == 3\n';
const CLAMP = 'def clamp(number):\n    return number if number < 10 else 10\n';
const LEGACY_MOVED = `"""Legacy module."""\n\nimport os\n\n\ndef value():\n    return 1\n\n\n${CLAMP}`;
const LEGACY_WEAKER = `import os\n\n\ndef value():\n    return 1 + 0\n\n\n${CLAMP}`;
const PRICING = 'def discount(price):\n    return price - 5 if price > 100 else price\n';
const PRICING_WITH_UNUSED = `${PRICING}\n\ndef unused():\n    return 3\n`;
const PRICING_TEST =
  'from demo.pricing import discount\n\n\ndef test_discount():\n    assert discount(50) == 50\n';
const PRICING_FULL_TEST =
  'from demo.pricing import discount\n\n\ndef test_discount():\n    assert discount(50) == 50\n    assert discount(101) == 96\n    assert discount(100) == 100\n';

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
    ]);
    commitBranch(project, 'clean', {
      'src/demo/greeter.py': GREETER_HI,
      'tests/test_greeter.py': GREETER_HI_TEST,
    });
    commitBranch(project, 'moved', { 'src/demo/legacy.py': LEGACY_MOVED });
    commitBranch(project, 'violation', { 'src/demo/bad.py': VIOLATION });
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
    expect(python.version).toMatch(/^ruff@[\d.]+;coverage@[\d.]+;pytest@[\d.]+;jscpd@[\d.]+$/);
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
    ).toEqual(['mutmut mutant-nocoverage bad.py', 'ruff F401 bad.py', 'ruff-format format bad.py']);
    const sarif = JSON.parse(readFileSync(path.join(result.reports, 'report.sarif'), 'utf8'));
    expect(sarif.runs[0].results.map(({ ruleId }) => ruleId)).toEqual([
      'coupling/module-coupling',
      'coupling/module-coupling',
      'coupling/module-coupling',
      'coverage/line-coverage',
      'coverage/uncovered-function',
      'mutmut/mutation-summary',
      'mutmut/mutant-nocoverage',
      'ruff/F401',
      'ruff-format/format',
    ]);
    expect(readFileSync(path.join(result.reports, 'report.junit.xml'), 'utf8')).toMatch(/F401/);
    expect(result.text).toMatch(/ruff\/F401 src\/demo\/bad\.py:1\n/);
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

  it('reports line coverage as a descriptive finding', () => {
    const result = gate(project, 'violation');

    expect(result.json('new-findings.json').filter(({ tool }) => tool === 'coverage')).toEqual([
      {
        tool: 'coverage',
        rule: 'line-coverage',
        path: 'src/demo/bad.py',
        identity: 'line-coverage',
        message: 'line-coverage 0% (0/3)',
        classification: 'descriptive',
        metric: { name: 'line-coverage', value: 0 },
      },
      {
        tool: 'coverage',
        rule: 'uncovered-function',
        path: 'src/demo/bad.py',
        identity: expect.any(String),
        message: 'Function f is not covered',
        classification: 'descriptive',
        symbol: 'f',
      },
    ]);
  });

  it('reports failing tests on head as a tool error with exit 2, never a throw', () => {
    const result = gate(project, 'failing-tests');

    expect(result.exitCode, result.text).toBe(2);
    expect(result.json('tool-errors.json')).toEqual([
      {
        tool: 'python',
        snapshot: 'head',
        rule: 'tests-failed',
        path: '.',
        message: expect.stringMatching(
          /^coverage run exited 1 in the virtualenv environment:\n[\s\S]*assert 'Hello, Ada!' == 'Hi, Ada!'[\s\S]*1 failed, 2 passed in [\d.]+s$/,
        ),
      },
    ]);
  });

  it('reports a missing environment as a tool error', () => {
    const result = gate(project, 'broken-environment');

    expect(result.exitCode, result.text).toBe(2);
    const message = `No Python environment at ${path.join(project, 'nowhere')} (${path.join(project, 'nowhere/bin')} does not exist): create it, or set "python.environment"`;
    expect(
      result.json('tool-errors.json').sort((left, right) => left.tool.localeCompare(right.tool)),
    ).toEqual([
      { tool: 'mutation', snapshot: 'head', message },
      { tool: 'python', snapshot: 'head', message },
    ]);
  });

  describe('a unittest project formatted with black, using tools from the PATH', () => {
    let plain;

    beforeAll(() => {
      plain = repository();
      write(plain, {
        'nitpicker.config.json': '{ "preset": "python", "python": { "testRunner": "unittest" } }\n',
        '.gitignore': '.venv/\n__pycache__/\nmutants/\n',
        'pyproject.toml': '[tool.black]\nline-length = 88\n',
        'pkg/__init__.py': '',
        'pkg/shape.py': 'def area(side):\n    return side * side\n',
        'tests/test_shape.py':
          'import unittest\n\nfrom pkg.shape import area\n\n\nclass AreaTest(unittest.TestCase):\n    def test_area(self):\n        self.assertEqual(area(3), 9)\n',
      });
      git(plain, 'init', '-q', '-b', 'main');
      git(plain, 'add', '-A');
      git(plain, 'commit', '-q', '-m', 'base');
      command(plain, 'uv', ['venv', '-q', '.venv']);
      command(plain, 'uv', [
        'pip',
        'install',
        '-q',
        '--python',
        '.venv',
        'coverage',
        'mutmut',
        'pytest',
      ]);
      commitBranch(plain, 'clean', {
        'pkg/shape.py': 'def area(side):\n    return side**2\n',
      });
      commitBranch(plain, 'unformatted', { 'pkg/extra.py': 'x = {"a":1}\n' });
    });

    it('runs unittest under coverage and passes a clean change', () => {
      const result = gate(plain, 'clean');

      expect(result.exitCode, result.text).toBe(0);
      expect(result.json('summary.json').tools[0].version).toMatch(
        /^ruff@[\d.]+;black@[\d.]+;coverage@[\d.]+;unittest;jscpd@[\d.]+$/,
      );
    });

    it('checks formatting with black', () => {
      const result = gate(plain, 'unformatted');

      expect(result.exitCode, result.text).toBe(1);
      expect(
        summarize(
          result
            .json('new-findings.json')
            .filter(({ classification }) => classification === 'enforceable'),
        ),
      ).toEqual(['black format extra.py']);
    });
  });

  describe('a pytest project with coverage and xdist in its addopts and a legacy python 2 file', () => {
    let configured;

    beforeAll(() => {
      configured = repository();
      write(configured, {
        'nitpicker.config.json': '{ "preset": "python" }\n',
        '.gitignore': '.venv/\n__pycache__/\n',
        'pyproject.toml':
          '[project]\nname = "pkg"\nversion = "0.1.0"\nrequires-python = ">=3.9"\n\n[tool.black]\nline-length = 88\n\n[tool.pytest.ini_options]\naddopts = "--cov=pkg -n 2 --lf"\n\n[tool.mutmut]\nsource_paths = ["pkg"]\n',
        'pkg/__init__.py': '',
        'pkg/shape.py': 'def area(side):\n    return side * side\n',
        'tests/test_shape.py':
          'from pkg.shape import area\n\n\ndef test_area():\n    assert area(3) == 9\n',
        'legacy/old.py': 'print "old"\n',
      });
      git(configured, 'init', '-q', '-b', 'main');
      git(configured, 'add', '-A');
      git(configured, 'commit', '-q', '-m', 'base');
      command(configured, 'uv', ['venv', '-q', '.venv']);
      command(configured, 'uv', [
        'pip',
        'install',
        '-q',
        '--python',
        '.venv',
        'coverage',
        'mutmut',
        'pytest',
        'pytest-cov',
        'pytest-xdist',
        'black',
      ]);
      commitBranch(configured, 'clean', {
        'pkg/shape.py': 'def area(side):\n    return side**2\n',
      });
      commitBranch(configured, 'excluded', {
        'nitpicker.config.json': '{ "preset": "python", "exclude": ["legacy/**"] }\n',
      });
      git(configured, 'checkout', '-q', '-b', 'no-tests', 'main');
      git(configured, 'rm', '-q', '-r', 'tests');
      git(configured, 'commit', '-q', '-m', 'delete the tests');
    });

    it('keeps the project pytest options working and baselines the file black cannot parse', () => {
      const result = gate(configured, 'clean');

      expect(result.exitCode, result.text).toBe(0);
      expect(result.json('new-findings.json').filter(({ tool }) => tool === 'coverage')).toEqual(
        [],
      );
      expect(result.json('summary.json').tools[0].unchanged).toBeGreaterThan(0);
    });

    it('does not hand excluded files to the formatter', () => {
      const result = gate(configured, 'excluded');

      expect(result.exitCode, result.text).toBe(0);
      expect(result.json('resolved-findings.json')).toEqual([
        {
          tool: 'ruff',
          rule: 'invalid-syntax',
          path: 'legacy/old.py',
          identity: expect.any(String),
          message: expect.any(String),
          classification: 'enforceable',
          location: { line: 1, column: 7 },
        },
      ]);
    });

    it('fails a change that deletes every test', () => {
      const result = gate(configured, 'no-tests');

      expect(result.exitCode, result.text).toBe(1);
      expect(
        summarize(
          result
            .json('new-findings.json')
            .filter(({ classification }) => classification === 'enforceable'),
        ),
      ).toEqual(['python no-tests-ran .']);
    });
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

const ORDER_TOTAL = [
  'def order_total(lines, discount):',
  '    total = 0',
  '    for line in lines:',
  '        if line.price > 0 and line.quantity > 0:',
  '            total += line.price * line.quantity',
  '        else:',
  '            total -= discount',
  '    if total < 0 and discount > 0:',
  '        total = 0',
  '    return total',
  '',
].join('\n');
const LAYERED_FILES = {
  'nitpicker.config.json': '{ "preset": "python", "disable": ["mutation"] }\n',
  '.gitignore': '.venv/\n__pycache__/\n',
  '.importlinter':
    '[importlinter]\nroot_package = shop\n\n[importlinter:contract:pure]\nname = Domain is pure\ntype = forbidden\nsource_modules = shop.domain\nforbidden_modules =\n    shop.web\n    shop.infra\n',
  'src/shop/__init__.py': '',
  'src/shop/domain/__init__.py': '',
  'src/shop/domain/pricing.py': `def price_with_tax(amount, rate):\n    return round(amount * (1 + rate), 2)\n\n\n${ORDER_TOTAL}`,
  'src/shop/infra/__init__.py': '',
  'src/shop/infra/store.py':
    'from shop.domain import pricing\n\n\ndef total(amounts):\n    return sum(pricing.price_with_tax(amount, 0.1) for amount in amounts)\n',
  'src/shop/web/__init__.py': '',
  'src/shop/web/views.py':
    'from shop.domain import pricing\nfrom shop.infra import store\n\n\ndef show(amounts):\n    return f"{store.total(amounts)} {pricing.price_with_tax(1, 0)}"\n',
  'tests/test_shop.py':
    'from shop.domain import pricing\nfrom shop.web import views\n\n\ndef test_show():\n    assert views.show([10]) == "11.0 1"\n\n\ndef test_total():\n    line = type("Line", (), {"price": 2, "quantity": 3})\n    assert pricing.order_total([line, line], 0) == 12\n',
};

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
      'src/shop/web/views.py': `${LAYERED_FILES['src/shop/web/views.py']}\n\ndef hide(amounts):\n    return len(amounts)\n`,
    });
    commitBranch(project, 'copy', {
      'src/shop/domain/bulk.py': ORDER_TOTAL.replace('order_total', 'bulk_total'),
      'tests/test_bulk.py':
        'from shop.domain import bulk\n\n\ndef test_bulk_total():\n    line = type("Line", (), {"price": 2, "quantity": 3})\n    empty = type("Line", (), {"price": 0, "quantity": 1})\n    assert bulk.bulk_total([line, empty], 5) == 1\n    assert bulk.bulk_total([empty], 5) == 0\n',
    });
    commitBranch(project, 'upward-import', {
      'src/shop/domain/pricing.py': `${LAYERED_FILES['src/shop/domain/pricing.py']}\n\ndef describe():\n    from shop.web import views\n\n    return views.show([1])\n`,
    });
    commitBranch(project, 'contracts-off', {
      'src/shop/domain/pricing.py': `${LAYERED_FILES['src/shop/domain/pricing.py']}\n\ndef describe():\n    from shop.web import views\n\n    return views.show([1])\n`,
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

  it('fails a stable package importing an unstable one and the contract it breaks', () => {
    const result = gate(project, 'upward-import');

    expect(result.exitCode, result.text).toBe(1);
    expect(
      enforceable(result).map(({ rule, path: file, identity }) => ({ rule, file, identity })),
    ).toEqual([
      {
        rule: 'stability-direction',
        file: 'src/shop/domain/__init__.py',
        identity: 'package-edge:shop.domain->shop.web',
      },
      {
        rule: 'contract-broken',
        file: 'src/shop/domain/pricing.py',
        identity: 'contract:Domain is pure:shop.domain.pricing -> shop.web.views',
      },
      {
        rule: 'contract-broken',
        file: 'src/shop/domain/pricing.py',
        identity:
          'contract:Domain is pure:shop.domain.pricing -> shop.web.views -> shop.infra.store',
      },
    ]);
  });

  it('does not run the contracts when the config turns import-linter off', () => {
    const result = gate(project, 'contracts-off');

    expect(newRules(result)).toEqual(['coupling stability-direction']);
    expect(result.json('summary.json').tools[0].version).not.toContain('import-linter');
  });
});

const SIGNS = 'def sign(x):\n    if x < 0:\n        return -1\n    return 1\n';
const BRANCH_CLAMP = 'def clamp(x):\n    if x > 10:\n        return 10\n    return x\n';
const signsTest = (...assertions) =>
  `from demo import signs\n\n\n${assertions
    .map(([name, body]) => `def test_${name}():\n    assert ${body}\n`)
    .join('\n\n')}`;
const PRAGMAS = [
  'import sys',
  '',
  '',
  'def hidden(x):  # pragma: no cover',
  '    if x:',
  '        return 1',
  '    return 2',
  '',
  '',
  'if __name__ == "__main__":',
  '    sys.exit(hidden(1))',
  '',
].join('\n');
const SIGN_POSITIVE = ['sign_positive', 'signs.sign(5) == 1'];
const SIGN_NEGATIVE = ['sign_negative', 'signs.sign(-5) == -1'];
const CLAMP_LOW = ['clamp_low', 'signs.clamp(1) == 1'];
const CLAMP_HIGH = ['clamp_high', 'signs.clamp(50) == 10'];

describe.skipIf(!enabled)('Python changed-branch coverage end to end', () => {
  let project;

  const branchFindings = (result) =>
    result
      .json('new-findings.json')
      .filter(({ rule }) => rule === 'changed-branch-coverage')
      .map(({ path: file, location }) => `${file}:${String(location.line)}`);

  beforeAll(() => {
    project = repository();
    cpSync(fixture, project, { recursive: true });
    write(project, {
      'nitpicker.config.json': '{ "preset": "python", "disable": ["mutation"] }\n',
      'src/demo/signs.py': SIGNS,
      'tests/test_signs.py': signsTest(SIGN_POSITIVE),
    });
    git(project, 'init', '-q', '-b', 'main');
    git(project, 'add', '-A');
    git(project, 'commit', '-q', '-m', 'base with an untested branch in sign');
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
      'pytest',
    ]);
    commitBranch(project, 'shifted', { 'src/demo/signs.py': `"""Signs."""\n\n\n${SIGNS}` });
    commitBranch(project, 'edited', {
      'src/demo/signs.py': SIGNS.replace('x < 0', 'x <= -1'),
    });
    commitBranch(project, 'edited-and-tested', {
      'src/demo/signs.py': SIGNS.replace('x < 0', 'x <= -1'),
      'tests/test_signs.py': signsTest(SIGN_POSITIVE, SIGN_NEGATIVE),
    });
    commitBranch(project, 'new-untested', {
      'src/demo/signs.py': `${SIGNS}\n\n${BRANCH_CLAMP}`,
      'tests/test_signs.py': signsTest(SIGN_POSITIVE, CLAMP_LOW),
    });
    commitBranch(project, 'pragmas', {
      'src/demo/pragmas.py': PRAGMAS,
      'tests/test_pragmas.py':
        'from demo import pragmas\n\n\ndef test_imported():\n    assert pragmas.hidden\n',
    });
    commitBranch(project, 'new-tested', {
      'src/demo/signs.py': `${SIGNS}\n\n${BRANCH_CLAMP}`,
      'tests/test_signs.py': signsTest(SIGN_POSITIVE, CLAMP_LOW, CLAMP_HIGH),
    });
  });

  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps an old uncovered branch baselined when its line moves', () => {
    const result = gate(project, 'shifted');

    expect(result.exitCode, result.text).toBe(0);
    expect(branchFindings(result)).toEqual([]);
  });

  it('fails an uncovered branch whose line was edited', () => {
    const result = gate(project, 'edited');

    expect(result.exitCode, result.text).toBe(1);
    expect(branchFindings(result)).toEqual(['src/demo/signs.py:2']);
    expect(result.text).toMatch(
      /Branch coverage is 50\.00%; minimum is 95%\. Not taken: the branch to line 3/,
    );
  });

  it('passes an edited branch once a test takes both outcomes', () => {
    const result = gate(project, 'edited-and-tested');

    expect(result.exitCode, result.text).toBe(0);
  });

  it('fails a new branch no test takes, and leaves the old gap alone', () => {
    const result = gate(project, 'new-untested');

    expect(result.exitCode, result.text).toBe(1);
    expect(branchFindings(result)).toEqual(['src/demo/signs.py:8']);
  });

  it('honors no pragma, but leaves the main guard alone', () => {
    const result = gate(project, 'pragmas');

    expect(branchFindings(result)).toEqual(['src/demo/pragmas.py:5']);
  });

  it('passes a new branch whose outcomes are both tested', () => {
    const result = gate(project, 'new-tested');

    expect(result.exitCode, result.text).toBe(0);
  });
});
