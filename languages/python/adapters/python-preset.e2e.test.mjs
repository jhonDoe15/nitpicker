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
// ruff, pyright and network access to PyPI (it installs pytest, coverage and mypy into throwaway
// environments), so it only runs with NITPICKER_PYTHON_E2E=1 (`npm run test:python`).

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

const enforceable = (result) =>
  summarize(
    result
      .json('new-findings.json')
      .filter(({ classification }) => classification === 'enforceable'),
  );

const summarize = (findings) =>
  findings.map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`).sort();

const VIOLATION = 'import sys\n\n\ndef f( a,b ):\n    return a+b\n';
const GREETER_HI = 'def greet(name):\n    return f"Hi, {name}!"\n';
const GREETER_HI_TEST =
  'from demo.greeter import greet\nfrom demo.legacy import clamp, value\n\n\ndef test_greet():\n    assert greet("Ada") == "Hi, Ada!"\n\n\ndef test_value():\n    assert value() == 1\n\n\ndef test_clamp():\n    assert clamp(3) == 3\n';
const TYPE_ERROR = 'def double(value: int) -> str:\n    return value * 2\n';
const ONE_WAY_VIOLATIONS = [
  'import os',
  'from dataclasses import dataclass',
  '',
  '',
  '@dataclass',
  'class Order:',
  '    identifier: str',
  '',
  '',
  'def home() -> str:',
  '    return os.path.join("a", "b")',
  '',
  '',
  'LIMIT: int = 3  # noqa: E501',
  '',
].join('\n');
const LEGACY_CLAMP = 'def clamp(number):\n    return number if number < 10 else 10\n';
const LEGACY_MOVED = `"""Legacy module."""\n\nimport os\n\n\ndef value():\n    return 1\n\n\n${LEGACY_CLAMP}`;
const LEGACY_WEAKER = `import os\n\n\ndef value():\n    return 1 + 0\n\n\n${LEGACY_CLAMP}`;
const PRICING = 'def discount(price):\n    return price - 5 if price > 100 else price\n';
const PRICING_WITH_UNUSED = `${PRICING}\n\ndef unused():\n    return 3\n`;
const PRICING_TEST =
  'from demo.pricing import discount\n\n\ndef test_discount():\n    assert discount(50) == 50\n';
const PRICING_FULL_TEST =
  'from demo.pricing import discount\n\n\ndef test_discount():\n    assert discount(50) == 50\n    assert discount(101) == 96\n    assert discount(100) == 100\n';

const SAMPLE_SOURCE = [
  'import functools',
  '',
  '',
  'class Service:',
  '    def method(self, a, b, c):',
  '        return a',
  '',
  '    @staticmethod',
  '    def static(a, b, c, d):',
  '        return a',
  '',
  '    @classmethod',
  '    def build(cls, a):',
  '        def inner(x):',
  '            if x:',
  '                return 1',
  '            return 2',
  '',
  '        return inner(a)',
  '',
  '    @functools.cache',
  '    async def fetch(self, *args, key=None, **kwargs):',
  '        """Docstring is not a statement."""',
  '        try:',
  '            await self.method(1, 2, 3)',
  '        except ValueError:',
  '            pass',
  '        finally:',
  '            key = 1',
  '        with open("f") as handle:',
  '            return lambda q: q if handle else key',
  '',
  '',
  'def chain(x):',
  '    if x == 1:',
  '        return 1',
  '    elif x == 2:',
  '        return 2',
  '    elif x == 3:',
  '        return 3',
  '    return 0',
  '',
  '',
  'def loops(items):',
  '    for item in items:',
  '        while item:',
  '            item -= 1',
  '            if item:',
  '                break',
  '    match items:',
  '        case []:',
  '            return 0',
  '        case _:',
  '            return 1',
  '',
  '',
  'def positional(a, /, b, *, c):',
  '    pass',
  '',
].join('\n');

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
    expect(result.json('summary.json').tools[0].version).toMatch(
      /^ruff@[\d.]+;mypy@[\d.]+;coverage@[\d.]+;pytest@[\d.]+;jscpd@[\d.]+;mutmut@[\d.]+$/,
    );
    expect(result.json('summary.json').tools[0].unchanged).toBeGreaterThan(0);
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
    expect(enforceable(result)).toEqual(['mypy return-value typed.py']);
    expect(result.text).toMatch(/Fix the type: correct the annotation or narrow the value/);
  });

  it('fails the one-way rules, each message naming the allowed form', () => {
    const result = gate(project, 'one-way');

    expect(result.exitCode, result.text).toBe(1);
    expect(enforceable(result)).toEqual([
      'python-rules frozen-dataclass rules.py',
      'python-rules no-inline-suppression rules.py',
      'ruff PTH118 rules.py',
    ]);
    expect(result.text).toMatch(/Declare records as `@dataclass\(frozen=True\)`/);
    expect(result.text).toMatch(/Use `pathlib\.Path`/);
    expect(result.text).toMatch(/`# noqa` and `# pyright: ignore` are banned/);
    expect(result.text).toMatch(/entry for PTH118 in nitpicker\.config\.json/);
  });

  it('passes the same code when python.exceptions lifts its rules', () => {
    const result = gate(project, 'excepted');

    expect(result.exitCode, result.text).toBe(0);
    expect(enforceable(result)).toEqual([]);
    expect(result.json('summary.json').configOverrides).toEqual([
      'preset: "python"',
      'exception: {"rule":"PTH118","paths":["src/demo/rules.py"],"reason":"fixture"}',
      'exception: {"rule":"frozen-dataclass","paths":["src/demo/*.py"],"reason":"fixture"}',
      'exception: {"rule":"no-inline-suppression","paths":["src/**"],"reason":"fixture"}',
    ]);
  });

  it('runs pyright when the project has a pyright config, in its strict mode', () => {
    const result = gate(project, 'pyright');

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('summary.json').tools[0].version).toMatch(
      /^ruff@[\d.]+;pyright@[\d.]+;coverage@[\d.]+;pytest@[\d.]+$/,
    );
    expect(enforceable(result)).toEqual(['pyright reportReturnType typed.py']);
  });

  it('fails new surviving and uncovered mutants but not the legacy survivors of the base', () => {
    const result = gate(project, 'survivors');

    expect(result.exitCode, result.text).toBe(1);
    const mutants = result.json('new-findings.json').filter(({ tool }) => tool === 'mutmut');
    expect(new Set(mutants.map(({ rule }) => rule))).toEqual(
      new Set(['mutant-survived', 'mutant-nocoverage']),
    );
    expect(new Set(mutants.map(({ path: file }) => file))).toEqual(
      new Set(['src/demo/pricing.py']),
    );
    expect(mutants.find(({ rule }) => rule === 'mutant-survived')).toEqual(
      expect.objectContaining({
        classification: 'enforceable',
        symbol: 'discount',
        location: expect.objectContaining({ line: expect.any(Number) }),
      }),
    );
  });

  it('passes new code whose mutants are all killed', () => {
    const result = gate(project, 'killed');

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('new-findings.json').filter(({ tool }) => tool === 'mutmut')).toEqual([]);
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

    expect(result.json('new-findings.json')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: 'coverage',
          rule: 'line-coverage',
          path: 'src/demo/bad.py',
          classification: 'descriptive',
        }),
        expect.objectContaining({
          tool: 'coverage',
          rule: 'uncovered-function',
          symbol: 'f',
        }),
      ]),
    );
  });

  it('reports failing tests on head as a tool error with exit 2, never a throw', () => {
    const result = gate(project, 'failing-tests');

    expect(result.exitCode, result.text).toBe(2);
    expect(result.json('tool-errors.json')).toEqual([
      expect.objectContaining({
        tool: 'python',
        snapshot: 'head',
        rule: 'tests-failed',
        message: expect.stringContaining('assert'),
      }),
    ]);
  });

  it('reports a missing environment as a tool error', () => {
    const result = gate(project, 'broken-environment');

    expect(result.exitCode, result.text).toBe(2);
    expect(result.json('tool-errors.json')).toEqual([
      expect.objectContaining({
        tool: 'python',
        snapshot: 'head',
        message: expect.stringMatching(/^No Python environment at .*nowhere/),
      }),
    ]);
  });

  describe('function structure and CRAP', () => {
    beforeAll(() => {
      commitBranch(project, 'nested-and-wide', {
        'src/demo/nested.py':
          'def classify(rows, skip, stop, default):\n    for row in rows:\n        for cell in row:\n            if cell:\n                return cell\n    return None\n',
        'tests/test_nested.py':
          'from demo.nested import classify\n\n\ndef test_classify():\n    assert classify([[0, 5]], 0, 0, 0) == 5\n    assert classify([[0]], 0, 0, 0) is None\n',
      });
      commitBranch(project, 'legacy-edited', {
        'src/demo/wide.py': 'def wide(a, b, c, d):\n    return a + b + c + d + 1\n',
      });
      commitBranch(project, 'legacy-grown', {
        'src/demo/wide.py': 'def wide(a, b, c, d, e):\n    return a + b + c + d + e\n',
      });
      commitBranch(project, 'untested-complex', {
        'src/demo/branchy.py':
          'def pick(a, b, c):\n    if a:\n        return 1\n    if b:\n        return 2\n    if c:\n        return 3\n    return 4\n',
      });
    });

    const enforceable = (result) =>
      result
        .json('new-findings.json')
        .filter(({ classification }) => classification === 'enforceable');

    it('fails a new function over the structure limits with the same rules as TypeScript and Java', () => {
      const result = gate(project, 'nested-and-wide');

      expect(result.exitCode, result.text).toBe(1);
      expect(
        enforceable(result).map(({ tool, rule, symbol }) => `${tool} ${rule} ${symbol}`),
      ).toEqual([
        'structure function-control-nesting-limit classify',
        'structure function-parameters-limit classify',
      ]);
    });

    it('keeps a touched legacy function that is still over the limit, and fails it when it grows', () => {
      expect(gate(project, 'legacy-edited').exitCode).toBe(0);

      const grown = gate(project, 'legacy-grown');

      expect(grown.exitCode, grown.text).toBe(1);
      expect(enforceable(grown)).toEqual([
        expect.objectContaining({
          rule: 'function-parameters-limit',
          message: expect.stringContaining('grew from 4 to 5 parameters'),
        }),
      ]);
    });

    it('fails a new untested branchy function on its CRAP score', () => {
      const result = gate(project, 'untested-complex');

      expect(result.exitCode, result.text).toBe(1);
      expect(enforceable(result)).toEqual([
        expect.objectContaining({
          tool: 'crap',
          rule: 'crap-score-limit',
          symbol: 'pick',
          message: expect.stringContaining('CRAP 20.00'),
        }),
      ]);
    });
  });

  describe('the structure metrics script', () => {
    const script = path.resolve(import.meta.dirname, '../metrics/structure_metrics.py');

    function metricsOf(files) {
      const directory = repository();
      write(directory, files);
      const listing = path.join(directory, 'listing.txt');
      writeFileSync(listing, Object.keys(files).join('\n'));
      const output = path.join(directory, 'metrics.json');
      command(directory, 'python3', [script, output, directory, listing]);
      return JSON.parse(readFileSync(output, 'utf8'));
    }

    it('counts lines, statements, control nesting and parameters the way the shared limits mean them', () => {
      const metrics = metricsOf({ 'sample.py': SAMPLE_SOURCE });

      expect(
        metrics.map((entry) => [
          entry.name,
          entry.start,
          entry.end,
          entry.lines,
          entry.statements,
          entry.maxControlNesting,
          entry.parameters,
        ]),
      ).toEqual([
        ['Service.method', 5, 6, 2, 1, 0, 3],
        ['Service.static', 8, 10, 3, 1, 0, 4],
        ['Service.build', 12, 19, 8, 2, 0, 1],
        ['Service.build.inner', 14, 17, 4, 3, 1, 1],
        ['Service.fetch', 21, 31, 11, 6, 1, 3],
        ['chain', 34, 41, 8, 7, 3, 1],
        ['loops', 44, 54, 11, 8, 3, 1],
        ['positional', 57, 58, 2, 1, 0, 3],
      ]);
      expect(metrics.every(({ file }) => file === 'sample.py')).toBe(true);
    });

    it('skips a file that does not parse', () => {
      const metrics = metricsOf({ 'broken.py': 'def (:\n', 'ok.py': 'def f():\n    return 1\n' });

      expect(metrics.map(({ file, name }) => `${file} ${name}`)).toEqual(['ok.py f']);
    });
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
        /^ruff@[\d.]+;black@[\d.]+;(?:mypy|pyright)@[\d.]+;coverage@[\d.]+;unittest;jscpd@[\d.]+;mutmut@[\d.]+$/,
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

const SIGNS = 'def sign(x):\n    if x < 0:\n        return -1\n    return 1\n';
const CLAMP = 'def clamp(x):\n    if x > 10:\n        return 10\n    return x\n';
const signsTest = (...assertions) =>
  `from demo import signs\n\n\n${assertions
    .map(([name, body]) => `def test_${name}():\n    assert ${body}\n`)
    .join('\n\n')}`;
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
      'src/demo/signs.py': `${SIGNS}\n\n${CLAMP}`,
      'tests/test_signs.py': signsTest(SIGN_POSITIVE, CLAMP_LOW),
    });
    commitBranch(project, 'new-tested', {
      'src/demo/signs.py': `${SIGNS}\n\n${CLAMP}`,
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

  it('passes a new branch whose outcomes are both tested', () => {
    const result = gate(project, 'new-tested');

    expect(result.exitCode, result.text).toBe(0);
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
  'nitpicker.config.json': '{ "preset": "python" }\n',
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
    });
    commitBranch(project, 'upward-import', {
      'src/shop/domain/pricing.py': `${LAYERED_FILES['src/shop/domain/pricing.py']}\n\ndef describe():\n    from shop.web import views\n\n    return views.show([1])\n`,
    });
    commitBranch(project, 'contracts-off', {
      'src/shop/domain/pricing.py': `${LAYERED_FILES['src/shop/domain/pricing.py']}\n\ndef describe():\n    from shop.web import views\n\n    return views.show([1])\n`,
      'nitpicker.config.json': '{ "preset": "python", "python": { "importLinter": false } }\n',
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
        message: expect.stringContaining('This code repeats src/shop/domain/pricing.py'),
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
        file: '.',
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
