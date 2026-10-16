import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeProjects } from './test-support/fake-project.mjs';

const fixtures = path.join(import.meta.dirname, 'fixtures');
const scriptTools = path.join(fixtures, 'fake-python-tools.cjs');
const shellTools = path.join(fixtures, 'fake-python-tools.sh');
const MISSING_NODE = '/nonexistent/node';
const PYTHON_SOURCES = {
  'src/demo/a.py': 'x = 1\n',
  'src/demo/b.py': 'y = 2\n',
  'tests/test_a.py': 'z = 3\n',
  '.venv/lib/site.py': 'w = 4\n',
  'top.py': 'v = 5\n',
};
const VIOLATIONS = [
  'F401|src/demo/a.py|`os` imported but unused',
  'B006|src/demo/b.py|Do not use "mutable" defaults \\ ever|extra',
  '',
  'E501|top.py|Line too long',
].join('\n');

const FAST_SCENARIOS = {
  'ruff --version': { tool: 'ruff', args: ['--version'] },
  'ruff check without violations': {
    tool: 'ruff',
    args: ['check', '--no-cache', '--output-format', 'sarif', '--output-file', 'out.sarif', '.'],
  },
  'ruff check with an empty violations file': {
    tool: 'ruff',
    args: ['check', '--output-file', 'out.sarif', '.'],
    files: { 'violations.txt': '' },
  },
  'ruff check with violations': {
    tool: 'ruff',
    args: ['check', '--output-file', 'out.sarif', '.'],
    files: { 'violations.txt': VIOLATIONS },
  },
  'ruff check with violations and no final newline': {
    tool: 'ruff',
    args: ['check', '--output-file', 'out.sarif', '.'],
    files: { 'violations.txt': 'F401|a.py|unused\nE501|b.py|long' },
  },
  'ruff --show-files': {
    tool: 'ruff',
    args: ['check', '--show-files', '--no-cache', '.'],
    files: PYTHON_SOURCES,
  },
  'ruff format with nothing to reformat': {
    tool: 'ruff',
    args: ['format', '--check', '--diff', '.'],
  },
  'mypy --version': { tool: 'mypy', args: ['--version'] },
  'mypy without errors': { tool: 'mypy', args: ['--strict', 'src'] },
  'mypy with errors': {
    tool: 'mypy',
    args: ['--strict', 'src'],
    files: { 'type-errors.txt': 'src/demo/a.py:1: error: Missing annotation  [no-untyped-def]\n' },
  },
  'coverage --version': { tool: 'coverage', args: ['--version'] },
  'coverage run': { tool: 'coverage', args: ['run', '-m', 'unittest', 'discover'] },
  'coverage run with failing tests': {
    tool: 'coverage',
    args: ['run', '-m', 'unittest', 'discover'],
    files: { 'test-exit.txt': '\n5\n' },
  },
  'coverage json without data': { tool: 'coverage', args: ['json', '-o', 'coverage.json'] },
  'coverage json with data': {
    tool: 'coverage',
    args: ['json', '--rcfile', 'rc', '-o', 'coverage.json', '--fail-under=0'],
    files: { 'coverage-data.json': '{"files":{"src/a.py":{"summary":{}}}}' },
  },
  'lizard --version': { tool: 'lizard', args: ['--version'] },
  'lizard without data': { tool: 'lizard', args: ['--csv', '-l', 'python'] },
  'lizard with data': {
    tool: 'lizard',
    args: ['--csv', '-l', 'python'],
    files: { 'lizard-data.csv': '1,1,1,1,1,"f@1-2@a.py","a.py","f","f()",1,2\n' },
  },
  'lint-imports --version': { tool: 'lint-imports', args: ['--version'] },
  'lint-imports default report': { tool: 'lint-imports', args: [] },
  'lint-imports kept report': {
    tool: 'lint-imports',
    args: [],
    files: { 'lint-imports.txt': 'Contracts: 1 kept, 0 broken.\n' },
  },
  'lint-imports broken report': {
    tool: 'lint-imports',
    args: [],
    files: { 'lint-imports.txt': 'Contracts: 0 kept, 1 broken.\nlayers BROKEN\n' },
  },
  'python rules script': {
    tool: 'python',
    args: ['-I', '/x/nitpicker_rules.py', 'files.txt', 'rules.json'],
  },
  'python rules script with findings': {
    tool: 'python',
    args: ['-I', '/x/nitpicker_rules.py', 'files.txt', 'out.json'],
    files: { 'rules.json': '[{"rule":"r"}]' },
  },
  'python executable probe': {
    tool: 'python',
    args: ['-c', 'import sys; print(sys.executable)'],
    env: { VIRTUAL_ENV: '/venv/demo' },
  },
  'python executable probe without a virtualenv': {
    tool: 'python',
    args: ['-c', 'import sys; print(sys.executable)'],
  },
  'python mutmut probe': {
    tool: 'python',
    args: ['-c', 'import importlib.metadata; print(importlib.metadata.version("mutmut"))'],
  },
  'python mutmut probe with a version': {
    tool: 'python',
    args: ['-c', 'import importlib.metadata; print(importlib.metadata.version("mutmut"))'],
    files: { 'mutmut-version.txt': '\n2.4.0\nignored\n' },
  },
  'python mutmut probe when missing': {
    tool: 'python',
    args: ['-c', 'import importlib.metadata; print(importlib.metadata.version("mutmut"))'],
    files: { 'no-mutmut.txt': '' },
  },
  'python import scan': { tool: 'python', args: ['-I', '/x/import-scan.py', 'request.json'] },
  'python import scan with data': {
    tool: 'python',
    args: ['-I', '/x/import-scan.py', 'request.json'],
    files: { 'import-scan.json': '{"modules":[]}' },
  },
  'python import-linter probe': {
    tool: 'python',
    args: ['-I', '-c', 'import importlib.metadata as m; print(m.version("import-linter"))'],
  },
  'python structure script': {
    tool: 'python',
    args: ['/x/structure_metrics.py', 'structure.json', '.', 'files.txt'],
  },
  'python structure script with data': {
    tool: 'python',
    args: ['/x/structure_metrics.py', 'structure.json', '.', 'files.txt'],
    files: { 'structure-data.json': '[{"name":"f"}]' },
  },
  'python pytest probe': { tool: 'python', args: ['-c', 'import importlib.util as u, pytest'] },
  'python pytest probe with plugins': {
    tool: 'python',
    args: ['-c', 'import importlib.util as u, pytest'],
    files: { 'pytest-cov.txt': '', 'xdist.txt': '' },
  },
  'python pytest probe when missing': {
    tool: 'python',
    args: ['-c', 'import importlib.util as u, pytest'],
    files: { 'no-pytest.txt': '' },
  },
};

const FALLBACK_SCENARIOS = {
  'ruff format with unformatted files': {
    tool: 'ruff',
    args: ['format', '--check', '--diff', '.'],
    files: { 'unformatted.txt': 'src/demo/a.py\n' },
  },
  'ruff --show-files with a source list': {
    tool: 'ruff',
    args: ['check', '--show-files', '.'],
    files: { 'sources.txt': 'src/demo/b.py\n', ...PYTHON_SOURCES },
  },
  'coverage run with a status that is not a number': {
    tool: 'coverage',
    args: ['run'],
    files: { 'test-exit.txt': 'abc\n' },
  },
  'a failing tool': {
    tool: 'mypy',
    args: ['--strict'],
    files: { 'fail.json': '{"mypy":"boom"}' },
  },
  'a logged call': { tool: 'ruff', args: ['--version'], env: { FAKE_PYTHON_LOG: 'calls.jsonl' } },
  'mutmut run': { tool: 'mutmut', args: ['run'] },
  pyright: { tool: 'pyright', args: ['--version'] },
  black: { tool: 'black', args: ['--check', '.'] },
};

function tree(root) {
  return Object.fromEntries(
    readdirSync(root, { recursive: true })
      .filter((entry) => statSync(path.join(root, entry)).isFile())
      .sort()
      .map((entry) => [
        entry,
        readFileSync(path.join(root, entry), 'utf8').replaceAll(root, '<root>'),
      ]),
  );
}

function outcome(command, { tool, args, files = {}, env = {} }, temporaryRoot) {
  const root = temporaryRoot();
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), contents);
  }
  const result = spawnSync(command[0], [...command.slice(1), tool, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, VIRTUAL_ENV: undefined, FAKE_PYTHON_LOG: undefined, ...env },
  });
  return {
    status: result.status,
    stdout: result.stdout.replaceAll(root, '<root>'),
    stderr: result.stderr.replaceAll(root, '<root>'),
    files: tree(root),
  };
}

const projects = createFakeProjects();
afterEach(projects.cleanup);

describe('fake Python tools', () => {
  describe('shell fast path', () => {
    for (const [name, scenario] of Object.entries(FAST_SCENARIOS)) {
      it(`answers ${name} like the script, without starting node`, () => {
        const expected = outcome([process.execPath, scriptTools], scenario, projects.temporaryRoot);

        const actual = outcome(
          ['/bin/sh', shellTools, MISSING_NODE, scriptTools],
          scenario,
          projects.temporaryRoot,
        );

        expect(actual).toEqual(expected);
      });
    }
  });
  describe('script fallback', () => {
    for (const [name, scenario] of Object.entries(FALLBACK_SCENARIOS)) {
      it(`hands ${name} to the script`, () => {
        const expected = outcome([process.execPath, scriptTools], scenario, projects.temporaryRoot);

        const actual = outcome(
          ['/bin/sh', shellTools, process.execPath, scriptTools],
          scenario,
          projects.temporaryRoot,
        );

        expect(actual).toEqual(expected);
      });
    }
  });
});
