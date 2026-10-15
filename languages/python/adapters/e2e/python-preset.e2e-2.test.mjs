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
  NO_MUTATION,
  SAME_NAME_SOURCES,
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
          new RegExp(
            [
              '^coverage run exited 1 in the virtualenv environment:\\n',
              "[\\s\\S]*assert 'Hello, Ada!' == 'Hi, Ada!'[\\s\\S]*1 faile",
              'd, 2 passed in [\\d.]+s$',
            ].join(''),
            '',
          ),
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
        'src/demo/branchy.py':
          'def pick(a, b, c):\n    if a:\n        return 1\n    if b:\n        return 2\n    if c:\n        return 3\n    return 4\n',
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
            'wide grew from 4 to 5 parameters (limit 3). Group related parameters into one object instead of adding another.',
          classification: 'enforceable',
          location: { line: 1 },
          ratchet: {
            key: 'function:wide:occurrence:1:parameters',
            value: 5,
            worseMessage:
              'wide grew from {base} to 5 parameters (limit 3). Group related parameters into one object instead of adding another.',
            heldMessage:
              'wide: 5 parameters (limit 3), allowed because base was {base}; any increase fails.',
          },
        },
      ]);
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
            'pick has CRAP 20.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function.',
          classification: 'enforceable',
          location: { line: 1 },
          ratchet: {
            key: 'function:pick:crap',
            value: 20,
            worseMessage:
              'pick CRAP rose from {base} to 20 (limit 9). Put new code in a new function and cover it with tests.',
            heldMessage:
              'pick: CRAP 20.00 (limit 9), allowed because base was {base}; any increase fails.',
          },
        },
      ]);
    });
  });
});
