import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedMutantsFromBase } from './python-mutation-reuse.mjs';

const roots = [];
const templates = new Map();
const environment = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

function git(cwd, ...arguments_) {
  return execFileSync('git', arguments_, { cwd, encoding: 'utf8', env: environment }).trim();
}

function write(root, files) {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
}

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-reuse-')));
  roots.push(root);
  return root;
}

const BASE_FILES = {
  'src/a.py': 'def f():\n    return 1\n',
  'src/pkg/b.py': 'def g():\n    return 1\n',
  'tests/test_a.py': 'def test_f():\n    pass\n',
  'uv.lock': 'lock\n',
};

function inProject(prefix, files) {
  return Object.fromEntries(Object.entries(files).map(([file, text]) => [prefix + file, text]));
}

beforeAll(() => {
  for (const prefix of ['', 'proj/']) {
    const root = temporaryRoot();
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.name', 'Reuse Test');
    git(root, 'config', 'user.email', 'reuse@example.invalid');
    write(root, { ...inProject(prefix, BASE_FILES), 'README.md': 'readme\n' });
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'base');
    templates.set(prefix, root);
  }
});

afterAll(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function scenario({ prefix = '', changes, rootChanges = {}, removed = [], baseMutants = true }) {
  const head = temporaryRoot();
  const base = temporaryRoot();
  cpSync(templates.get(prefix), head, { recursive: true });
  cpSync(templates.get(prefix), base, { recursive: true });
  write(head, { ...inProject(prefix, changes), ...rootChanges });
  for (const file of removed) {
    rmSync(path.join(head, prefix + file));
  }
  git(head, 'add', '-A');
  git(head, 'commit', '-q', '--allow-empty', '-m', 'head');
  const baselineRoot = path.join(base, prefix);
  if (baseMutants) {
    write(baselineRoot, {
      'mutants/src/a.py.meta': '{"exit_code_by_key": {"a.x_f__mutmut_1": 0}}',
      'mutants/src/pkg/b.py.meta': '{"exit_code_by_key": {}}',
      'mutants/src/a.py': 'generated',
      'mutants/mutmut-stats.json': '{}',
      'mutants/tests/test_a.py': 'copied test',
    });
  }
  return { baselineRoot, projectRoot: path.join(head, prefix) };
}

function seed(setup, overrides = {}) {
  return seedMutantsFromBase({
    snapshot: 'head',
    sourceRoots: ['src'],
    ...setup,
    ...overrides,
  });
}

function seeded(projectRoot) {
  const directory = path.join(projectRoot, 'mutants');
  return existsSync(directory) ? readdirSync(directory, { recursive: true }).sort() : [];
}

describe('reusing the base mutation results on head', () => {
  it('copies only the result files of the base when just mutated sources changed', () => {
    const setup = scenario({
      changes: { 'src/a.py': 'def f():\n    return 2\n', 'src/new.py': 'x = 1\n' },
    });

    expect(seed(setup)).toBe(true);

    expect(seeded(setup.projectRoot)).toEqual([
      'src',
      path.join('src', 'a.py.meta'),
      path.join('src', 'pkg'),
      path.join('src', 'pkg', 'b.py.meta'),
    ]);
  });

  it('reuses the results when nothing changed', () => {
    const setup = scenario({ changes: {} });

    expect(seed(setup)).toBe(true);
  });

  it('works in a project below the repository root', () => {
    const setup = scenario({
      prefix: 'proj/',
      changes: { 'src/a.py': 'def f():\n    return 2\n' },
    });

    expect(seed(setup)).toBe(true);
    expect(seeded(setup.projectRoot)).toContain(path.join('src', 'a.py.meta'));
  });

  it('runs every mutant when the change reaches outside the project', () => {
    const setup = scenario({
      prefix: 'proj/',
      changes: { 'src/a.py': 'def f():\n    return 2\n' },
      rootChanges: { 'README.md': 'changed\n' },
    });

    expect(seed(setup)).toBe(false);
  });

  it.each([
    ['a test', { 'tests/test_a.py': 'def test_f():\n    assert True\n' }],
    ['a test module next to the sources', { 'src/pkg/test_b.py': 'x = 1\n' }],
    ['a test module named like *_test.py', { 'src/pkg/b_test.py': 'x = 1\n' }],
    ['a conftest', { 'src/conftest.py': 'x = 1\n' }],
    ['a tests directory inside the sources', { 'src/pkg/tests/helper.py': 'x = 1\n' }],
    ['a dependency lock', { 'uv.lock': 'new lock\n' }],
    ['a file outside the source roots', { 'scripts/run.py': 'x = 1\n' }],
    ['a file that is not Python', { 'src/data.json': '{}\n' }],
    ['a source and a test together', { 'src/a.py': 'x = 1\n', 'tests/test_a.py': 'y = 1\n' }],
  ])('runs every mutant when %s changed', (_, changes) => {
    const setup = scenario({ changes });

    expect(seed(setup)).toBe(false);
    expect(seeded(setup.projectRoot)).toEqual([]);
  });

  it('runs every mutant when a source file was deleted or renamed', () => {
    const deleted = scenario({ changes: {}, removed: ['src/pkg/b.py'] });
    const renamed = scenario({
      changes: { 'src/pkg/c.py': 'def g():\n    return 1\n' },
      removed: ['src/pkg/b.py'],
    });

    expect(seed(deleted)).toBe(false);
    expect(seed(renamed)).toBe(false);
  });

  it('treats a source root of . as all Python files', () => {
    const setup = scenario({ changes: { 'tests/test_a.py': 'x = 1\n', 'src/a.py': 'y = 1\n' } });
    const lenient = scenario({ changes: { 'tools/run.py': 'x = 1\n' } });

    expect(seed(setup, { sourceRoots: ['.'] })).toBe(false);
    expect(seed(lenient, { sourceRoots: ['.'] })).toBe(true);
  });

  it('does nothing on base, without a base directory, or when the base left no results', () => {
    const setup = scenario({ changes: { 'src/a.py': 'x = 1\n' } });
    const without = scenario({ changes: { 'src/a.py': 'x = 1\n' }, baseMutants: false });

    expect(seed(setup, { snapshot: 'base' })).toBe(false);
    expect(seed(setup, { baselineRoot: undefined })).toBe(false);
    expect(seed(without)).toBe(false);
    expect(seeded(without.projectRoot)).toEqual([]);
  });

  it('runs every mutant when git cannot say what changed', () => {
    const setup = scenario({ changes: { 'src/a.py': 'x = 1\n' } });
    const elsewhere = temporaryRoot();
    write(elsewhere, { 'mutants/src/a.py.meta': '{"exit_code_by_key": {}}' });

    expect(seed(setup, { baselineRoot: elsewhere })).toBe(false);
    expect(seed(setup, { projectRoot: elsewhere })).toBe(false);
  });
});
