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
  'from demo.greeter import greet\nfrom demo.legacy import value\n\n\ndef test_greet():\n    assert greet("Ada") == "Hi, Ada!"\n\n\ndef test_value():\n    assert value() == 1\n';
const LEGACY_MOVED = '"""Legacy module."""\n\nimport os\n\n\ndef value():\n    return 1\n';

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
      'pytest',
    ]);
    commitBranch(project, 'clean', {
      'src/demo/greeter.py': GREETER_HI,
      'tests/test_greeter.py': GREETER_HI_TEST,
    });
    commitBranch(project, 'moved', { 'src/demo/legacy.py': LEGACY_MOVED });
    commitBranch(project, 'violation', { 'src/demo/bad.py': VIOLATION });
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
      /^ruff@[\d.]+;coverage@[\d.]+;pytest@[\d.]+$/,
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
    ).toEqual(['ruff F401 bad.py', 'ruff-format format bad.py']);
    const sarif = JSON.parse(readFileSync(path.join(result.reports, 'report.sarif'), 'utf8'));
    expect(sarif.runs[0].results.map(({ ruleId }) => ruleId)).toEqual([
      'coverage/line-coverage',
      'coverage/uncovered-function',
      'ruff/F401',
      'ruff-format/format',
    ]);
    expect(readFileSync(path.join(result.reports, 'report.junit.xml'), 'utf8')).toMatch(/F401/);
    expect(result.text).toMatch(/ruff\/F401 src\/demo\/bad\.py:1\n/);
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
          /^coverage run exited 1 in the virtualenv environment:\n[\s\S]*assert 'Hello, Ada!' == 'Hi, Ada!'[\s\S]*1 failed, 1 passed in [\d.]+s$/,
        ),
      },
    ]);
  });

  it('reports a missing environment as a tool error', () => {
    const result = gate(project, 'broken-environment');

    expect(result.exitCode, result.text).toBe(2);
    expect(result.json('tool-errors.json')).toEqual([
      {
        tool: 'python',
        snapshot: 'head',
        message: `No Python environment at ${path.join(project, 'nowhere')} (${path.join(project, 'nowhere/bin')} does not exist): create it, or set "python.environment"`,
      },
    ]);
  });

  describe('a unittest project formatted with black, using tools from the PATH', () => {
    let plain;

    beforeAll(() => {
      plain = repository();
      write(plain, {
        'nitpicker.config.json': '{ "preset": "python" }\n',
        '.gitignore': '.venv/\n__pycache__/\n',
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
      command(plain, 'uv', ['pip', 'install', '-q', '--python', '.venv', 'coverage']);
      commitBranch(plain, 'clean', {
        'pkg/shape.py': 'def area(side):\n    return side**2\n',
      });
      commitBranch(plain, 'unformatted', { 'pkg/extra.py': 'x = {"a":1}\n' });
    });

    it('runs unittest under coverage and passes a clean change', () => {
      const result = gate(plain, 'clean');

      expect(result.exitCode, result.text).toBe(0);
      expect(result.json('summary.json').tools[0].version).toMatch(
        /^ruff@[\d.]+;black@[\d.]+;coverage@[\d.]+;unittest$/,
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
          '[project]\nname = "pkg"\nversion = "0.1.0"\nrequires-python = ">=3.9"\n\n[tool.black]\nline-length = 88\n\n[tool.pytest.ini_options]\naddopts = "--cov=pkg -n 2 --lf"\n',
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
