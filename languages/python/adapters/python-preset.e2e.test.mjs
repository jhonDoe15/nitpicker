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
import {
  VIOLATION,
  GREETER_HI,
  GREETER_HI_TEST,
  TYPE_ERROR,
  ONE_WAY_VIOLATIONS,
  HIDDEN_ERROR,
  WEAKENED_PYRIGHT,
  LEGACY_MOVED,
  LEGACY_WEAKER,
  PRICING,
  PRICING_WITH_UNUSED,
  PRICING_TEST,
  PRICING_FULL_TEST,
  SAME_NAME_SOURCES,
  SAMPLE_SOURCE,
  BRANCHY,
  NO_MUTATION,
  ORDER_TOTAL,
  LAYERED_FILES,
  SIGNS,
  BRANCH_CLAMP,
  signsTest,
  PRAGMAS,
  SIGN_POSITIVE,
  SIGN_NEGATIVE,
  CLAMP_LOW,
  CLAMP_HIGH,
} from './fixtures/python-e2e-sources.mjs';

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

const withoutMutants = (summaries) => summaries.filter((summary) => !summary.startsWith('mutmut '));

const summarize = (findings) =>
  findings.map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`).sort();

const WEAKENED_MYPY = `${readFileSync(path.join(fixture, 'pyproject.toml'), 'utf8')}\n[tool.mypy]\nignore_errors = true\ndisable_error_code = ["return-value"]\nexclude = ["src/demo/typed.py"]\n`;
const exceptedConfig = (...exceptions) => ({
  'nitpicker.config.json': `${JSON.stringify({ preset: 'python', disable: ['mutation'], exceptions })}\n`,
});

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
    expect(result.text).toMatch(
      /add \{"rule":"PTH118","paths":\["src\/demo\/rules\.py"\],"reason":"<why this is intended>"\} to "python\.exceptions" in nitpicker\.config\.json\./,
    );
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
        'Survived operator: replacing `-` with `+` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears. If a reviewer agrees this is intended, add {"rule":"mutant-survived","paths":["src/demo/pricing.py"],"function":"discount","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
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

  describe('function structure and CRAP', () => {
    beforeAll(() => {
      commitBranch(project, 'nested-and-wide', {
        ...NO_MUTATION,
        'src/demo/nested.py':
          'def classify(rows, skip, stop, default):\n    for row in rows:\n        for cell in row:\n            if cell:\n                return cell\n    return None\n',
        'tests/test_nested.py':
          'from demo.nested import classify\n\n\ndef test_classify():\n    assert classify([[0, 5]], 0, 0, 0) == 5\n    assert classify([[0]], 0, 0, 0) is None\n',
      });
      commitBranch(project, 'legacy-edited', {
        ...NO_MUTATION,
        'src/demo/wide.py': 'def wide(a, b, c, d):\n    return a + b + c + d + 1\n',
      });
      commitBranch(project, 'legacy-grown', {
        ...NO_MUTATION,
        'src/demo/wide.py': 'def wide(a, b, c, d, e):\n    return a + b + c + d + e\n',
      });
      commitBranch(project, 'untested-complex', {
        ...NO_MUTATION,
        ...SAME_NAME_SOURCES,
        'src/demo/branchy.py': BRANCHY,
      });
      commitBranch(project, 'untested-complex-excepted', {
        ...exceptedConfig({
          rule: 'crap-score-limit',
          paths: ['src/demo/branchy.py'],
          function: 'pick',
          reason: 'fixture',
        }),
        ...SAME_NAME_SOURCES,
        'src/demo/branchy.py': BRANCHY,
      });
      commitBranch(project, 'legacy-grown-excepted', {
        ...exceptedConfig({
          rule: 'function-parameters-limit',
          paths: ['src/demo/wide.py'],
          function: 'wide',
          reason: 'fixture',
        }),
        'src/demo/wide.py': 'def wide(a, b, c, d, e):\n    return a + b + c + d + e\n',
      });
    });

    const enforceable = (result) =>
      result
        .json('new-findings.json')
        .filter(
          ({ classification, tool }) =>
            classification === 'enforceable' && ['structure', 'crap'].includes(tool),
        );

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
        {
          tool: 'structure',
          rule: 'function-parameters-limit',
          path: 'src/demo/wide.py',
          symbol: 'wide',
          identity: expect.any(String),
          message:
            'wide grew from 4 to 5 parameters (limit 3). Group related parameters into one object instead of adding another. If a reviewer agrees this is intended, add {"rule":"function-parameters-limit","paths":["src/demo/wide.py"],"function":"wide","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
          classification: 'enforceable',
          location: { line: 1 },
          ratchet: {
            key: 'function:wide:occurrence:1:parameters',
            value: 5,
            worseMessage:
              'wide grew from {base} to 5 parameters (limit 3). Group related parameters into one object instead of adding another. If a reviewer agrees this is intended, add {"rule":"function-parameters-limit","paths":["src/demo/wide.py"],"function":"wide","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
            heldMessage:
              'wide: 5 parameters (limit 3), allowed because base was {base}; any increase fails.',
          },
        },
      ]);
    });

    it('passes the grown legacy function once an exception names it', () => {
      const result = gate(project, 'legacy-grown-excepted');

      expect(result.exitCode, result.text).toBe(0);
      expect(enforceable(result)).toEqual([]);
    });

    it('lifts the CRAP score of the untested branchy function once an exception names it', () => {
      expect(enforceable(gate(project, 'untested-complex-excepted'))).toEqual([]);
    });

    it('fails a new untested branchy function on its CRAP score, and scores tested same-named definitions from their own lines', () => {
      const result = gate(project, 'untested-complex');

      expect(result.exitCode, result.text).toBe(1);
      expect(enforceable(result)).toEqual([
        {
          tool: 'crap',
          rule: 'crap-score-limit',
          path: 'src/demo/branchy.py',
          symbol: 'pick',
          identity: expect.any(String),
          message:
            'pick has CRAP 20.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function. If a reviewer agrees this is intended, add {"rule":"crap-score-limit","paths":["src/demo/branchy.py"],"function":"pick","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
          classification: 'enforceable',
          location: { line: 1 },
          ratchet: {
            key: 'function:pick:crap',
            value: 20,
            worseMessage:
              'pick CRAP rose from {base} to 20 (limit 9). Put new code in a new function and cover it with tests. If a reviewer agrees this is intended, add {"rule":"crap-score-limit","paths":["src/demo/branchy.py"],"function":"pick","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
            heldMessage:
              'pick: CRAP 20.00 (limit 9), allowed because base was {base}; any increase fails.',
          },
        },
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
        ['Service.fetch', 21, 31, 10, 6, 1, 3],
        ['chain', 34, 41, 8, 7, 3, 1],
        ['loops', 44, 54, 11, 8, 3, 1],
        ['positional', 57, 58, 2, 1, 0, 3],
      ]);
      expect(metrics.every(({ file }) => file === 'sample.py')).toBe(true);
    });

    it('skips a file that does not parse, or that is too deep for the parser', () => {
      const metrics = metricsOf({
        'broken.py': 'def (:\n',
        'deep.py': `X = ${Array.from({ length: 60_000 }, () => '1').join(' + ')}\n`,
        'ok.py': 'def f():\n    return 1\n',
      });

      expect(metrics.map(({ file, name }) => `${file} ${name}`)).toEqual(['ok.py f']);
    });

    it('does not count the docstring as a line, so documenting a long function does not grow it', () => {
      const body = ['    a = 1', '    return a'];
      const lines = (...head) =>
        metricsOf({ 'doc.py': ['def f():', ...head, ...body, ''].join('\n') })[0].lines;

      expect(lines()).toBe(3);
      expect(lines('    """Doc."""')).toBe(3);
      expect(lines('    """Doc.', '', '    More.', '    """')).toBe(3);
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
        /^ruff@[\d.]+;black@[\d.]+;(?:mypy|pyright)@[\d.]+;coverage@[\d.]+;unittest;jscpd@[\d.]+$/,
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
          'This code repeats src/shop/domain/pricing.py:5 (10 lines). Keep one copy and call it from both places. If a reviewer agrees this is intended, add {"rule":"duplicate-clone","paths":["src/shop/domain/bulk.py"],"reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
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
    commitBranch(project, 'edited-excepted', {
      ...exceptedConfig({
        rule: 'changed-branch-coverage',
        paths: ['src/demo/signs.py'],
        function: 'sign',
        reason: 'fixture',
      }),
      'src/demo/signs.py': SIGNS.replace('x < 0', 'x <= -1'),
    });
    commitBranch(project, 'edited-wrong-function', {
      ...exceptedConfig({
        rule: 'changed-branch-coverage',
        paths: ['src/demo/signs.py'],
        function: 'clamp',
        reason: 'fixture',
      }),
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

  it('names the exceptions entry that accepts the untested branch', () => {
    const result = gate(project, 'edited');

    expect(
      result
        .json('new-findings.json')
        .filter(({ rule }) => rule === 'changed-branch-coverage')
        .map(({ message, symbol }) => [symbol, message]),
    ).toEqual([
      [
        'sign',
        'Branch coverage is 50.00%; minimum is 95%. Not taken: the branch to line 3. Test it, or remove it if it can\'t happen. If a reviewer agrees this is intended, add {"rule":"changed-branch-coverage","paths":["src/demo/signs.py"],"function":"sign","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
      ],
    ]);
  });

  it('accepts the untested branch of the function an exceptions entry names, and no other', () => {
    const accepted = gate(project, 'edited-excepted');
    const other = gate(project, 'edited-wrong-function');

    expect(accepted.exitCode, accepted.text).toBe(0);
    expect(branchFindings(accepted)).toEqual([]);
    expect(accepted.json('summary.json').configOverrides).toEqual([
      'preset: "python"',
      'disable: ["mutation"]',
      'exception: {"rule":"changed-branch-coverage","paths":["src/demo/signs.py"],"function":"sign","reason":"fixture"}',
    ]);
    expect(other.exitCode, other.text).toBe(1);
    expect(branchFindings(other)).toEqual(['src/demo/signs.py:2']);
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
