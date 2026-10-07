import { execFileSync } from 'node:child_process';
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
import { collectWorkingTreeChanges } from './changes.mjs';
import { routeChangedFiles } from './checkers.mjs';
import { parseArguments } from './cli.mjs';
import { runWorkingTreeQuality } from './run.mjs';

const toolRoot = path.resolve(import.meta.dirname, '../..');
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('working-tree change collection', () => {
  it('collects committed, staged, unstaged, renamed, deleted, and untracked paths once', () => {
    const repository = createRepository({
      'src/main/committed.ts': 'export const committed = 1;\n',
      'src/main/staged only.ts': 'export const staged = 1;\n',
      'src/main/renamed old.json': '{"renamed": true}\n',
      'docs/deleted.md': '# Delete me\n',
    });
    writeFiles(repository.projectRoot, {
      'src/main/committed.ts': 'export const committed = 2;\n',
    });
    commit(repository.root, 'committed branch change');
    writeFiles(repository.projectRoot, {
      'src/main/committed.ts': 'export const committed = 3;\n',
      'src/main/staged only.ts': 'export const staged = 2;\n',
      'src/main/untracked file.ts': 'export const untracked = true;\n',
    });
    git(repository.root, ['add', projectPath('src/main/staged only.ts')]);
    git(repository.root, [
      'mv',
      projectPath('src/main/renamed old.json'),
      projectPath('src/main/renamed new.json'),
    ]);
    rmSync(path.join(repository.projectRoot, 'docs/deleted.md'));

    const result = collectWorkingTreeChanges({
      repositoryRoot: repository.root,
      projectRoot: repository.projectRoot,
      baseRef: repository.baseRef,
    });
    const byPath = new Map(result.changes.map((change) => [change.path, change]));

    expect([...byPath.keys()]).toEqual([
      'docs/deleted.md',
      'src/main/committed.ts',
      'src/main/renamed new.json',
      'src/main/staged only.ts',
      'src/main/untracked file.ts',
    ]);
    expect(byPath.get('src/main/committed.ts').sources).toEqual(['committed', 'unstaged']);
    expect(byPath.get('src/main/staged only.ts').sources).toEqual(['staged']);
    expect(byPath.get('src/main/untracked file.ts').sources).toEqual(['untracked']);
    expect(byPath.get('docs/deleted.md').isFile).toBe(false);
    expect(byPath.get('src/main/renamed new.json')).toEqual(
      expect.objectContaining({
        sources: ['staged'],
        previousRepositoryPaths: [projectPath('src/main/renamed old.json')],
        baseRepositoryPath: projectPath('src/main/renamed old.json'),
      }),
    );
  });

  it('returns an empty clean run when there are no changes', () => {
    const repository = createRepository({ 'src/main/clean.ts': 'export const clean = true;\n' });
    const outputRoot = path.join(repository.projectRoot, 'reports/quality/working-tree');
    const result = runWorkingTreeQuality({
      baseRef: repository.baseRef,
      fixSafe: false,
      projectRoot: repository.projectRoot,
      outputRoot,
      toolRoot,
      execute() {
        throw new Error('No checker should run');
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.report.summary).toEqual(
      expect.objectContaining({ status: 'clean', changedPaths: 0, checkedFiles: 0 }),
    );
    expect(existsSync(path.join(outputRoot, 'logs'))).toBe(true);
  });
});

describe('working-tree checks', () => {
  it('routes TypeScript and supported text formats while preserving generated exclusions', () => {
    const change = (filePath) => ({ path: filePath, isFile: true });
    const routes = routeChangedFiles([
      change('vitest.config.ts'),
      change('docs/report.html'),
      change('docs/query.graphql'),
      change('src/main/dist/generated.graphql'),
      change('reports/quality/report.graphql'),
    ]);

    expect(routes.eslintFiles.map(({ path: filePath }) => filePath)).toEqual(['vitest.config.ts']);
    expect(routes.prettierFiles.map(({ path: filePath }) => filePath)).toEqual([
      'vitest.config.ts',
      'docs/report.html',
      'docs/query.graphql',
    ]);
  });

  it('does not report pre-existing formatting findings outside changed files', () => {
    const repository = createRepository({
      'src/main/changed.mjs': 'export const changed = true;\n',
      'src/main/legacy.mjs': 'export const legacy=true\n',
    });
    writeFiles(repository.projectRoot, {
      'src/main/changed.mjs': 'export const changed = false;\n',
    });

    const result = runFixture(repository, { fixSafe: false });

    expect(result.exitCode).toBe(0);
    expect(result.report.findings).toEqual([]);
    expect(result.report.changes.map(({ path: filePath }) => filePath)).toEqual([
      'src/main/changed.mjs',
    ]);
  });

  it('fixes new and base-clean files without rewriting edited legacy formatting', () => {
    const repository = createRepository({
      'src/main/base clean.mjs': 'export const value = true;\n',
      'src/main/legacy.mjs': 'export const legacy=true\n',
    });
    writeFiles(repository.projectRoot, {
      'src/main/base clean.mjs': 'export const value=false\n',
      'src/main/legacy.mjs': 'export const legacy=false\n',
      'src/main/new file.mjs': 'export const fresh=true\n',
    });

    const result = runFixture(repository, { fixSafe: true });

    expect(result.exitCode).toBe(1);
    expect(readFixture(repository, 'src/main/base clean.mjs')).toBe(
      'export const value = false;\n',
    );
    expect(readFixture(repository, 'src/main/new file.mjs')).toBe('export const fresh = true;\n');
    expect(readFixture(repository, 'src/main/legacy.mjs')).toBe('export const legacy=false\n');
    expect(result.report.summary).toEqual(
      expect.objectContaining({ prettierFixFiles: 2, prettierFixSkipped: 1 }),
    );
    expect(result.report.findings).toEqual([
      expect.objectContaining({
        path: 'src/main/legacy.mjs',
        rule: 'prettier/prettier',
      }),
    ]);
  });

  it('uses a renamed file base path to choose the safe-fix parser', () => {
    const repository = createRepository({
      'src/main/legacy.json': '{"legacy":true}\n',
    });
    git(repository.root, [
      'mv',
      projectPath('src/main/legacy.json'),
      projectPath('src/main/legacy.md'),
    ]);

    const result = runFixture(repository, { fixSafe: true });

    expect(result.exitCode).toBe(0);
    expect(readFixture(repository, 'src/main/legacy.md')).toBe('{"legacy":true}\n');
    expect(result.report.summary).toEqual(
      expect.objectContaining({ prettierFixFiles: 0, prettierFixSkipped: 1 }),
    );
  });

  it('runs the Prettier fixer after an ESLint fixer failure', () => {
    const repository = createRepository({});
    writeFiles(repository.projectRoot, {
      'src/main/new.ts': 'export const value=true\n',
      'src/main/new.json': '{"value":true}\n',
    });
    const operations = [];
    const result = runWorkingTreeQuality({
      baseRef: repository.baseRef,
      fixSafe: true,
      projectRoot: repository.projectRoot,
      outputRoot: path.join(repository.projectRoot, 'reports/quality/working-tree'),
      toolRoot,
      execute({ operation }) {
        operations.push(operation);
        if (operation === 'eslint-fix') {
          return { status: 2, stderr: 'fixture ESLint failure' };
        }
        if (operation === 'eslint-check') {
          return { status: 0, stdout: '[]' };
        }
        return { status: 0 };
      },
    });

    expect(operations).toEqual(['eslint-fix', 'prettier-fix', 'eslint-check', 'prettier-check']);
    expect(result.exitCode).toBe(2);
    expect(result.report.toolErrors).toEqual([expect.objectContaining({ tool: 'eslint-fix' })]);
  });

  it('persists full tool output and prints one file-and-rule summary', () => {
    const repository = createRepository({
      'src/main/changed.ts': 'export const changed = true;\n',
    });
    writeFiles(repository.projectRoot, {
      'src/main/changed.ts': 'export const changed = false;\n',
    });
    const outputRoot = path.join(repository.projectRoot, 'reports/quality/working-tree');
    const result = runWorkingTreeQuality({
      baseRef: repository.baseRef,
      fixSafe: false,
      projectRoot: repository.projectRoot,
      outputRoot,
      toolRoot,
      execute({ operation }) {
        if (operation === 'eslint-check') {
          return {
            status: 1,
            stdout: JSON.stringify([
              {
                filePath: path.join(repository.projectRoot, 'src/main/changed.ts'),
                messages: [
                  {
                    ruleId: '@typescript-eslint/fixture-rule',
                    severity: 2,
                    line: 1,
                    column: 14,
                    message: 'fixture lint diagnostic',
                  },
                ],
              },
            ]),
          };
        }
        return { status: 1, stdout: './src/main/changed.ts\n' };
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.text.match(/^src\/main\/changed\.ts:$/gm)).toHaveLength(1);
    expect(result.text).toContain('  @typescript-eslint/fixture-rule:');
    expect(result.text).toContain('  prettier/prettier:');
    expect(readFileSync(path.join(outputRoot, 'logs/eslint-check.log'), 'utf8')).toContain(
      'fixture lint diagnostic',
    );
    expect(readFileSync(path.join(outputRoot, 'logs/prettier-check.log'), 'utf8')).toContain(
      './src/main/changed.ts',
    );
  });
});

describe('working-tree arguments', () => {
  it('requires an explicit base ref', () => {
    expect(() => parseArguments([])).toThrow(/explicit base ref is required/);
  });

  it('parses safe-fix and output options', () => {
    expect(
      parseArguments(['--base', 'origin/master', '--fix-safe', '--output', 'custom-report']),
    ).toEqual({
      kind: 'run',
      baseRef: 'origin/master',
      fixSafe: true,
      outputRoot: 'custom-report',
    });
  });
});

function createRepository(initialProjectFiles) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'working-tree-quality-')));
  temporaryRoots.push(root);
  const projectRoot = path.join(root, 'packages/example');
  mkdirSync(projectRoot, { recursive: true });
  git(root, ['init', '-q', '--initial-branch=master']);
  git(root, ['config', 'user.name', 'Working Tree Fixture']);
  git(root, ['config', 'user.email', 'working-tree@example.invalid']);
  writeFiles(projectRoot, {
    'package.json': '{"name":"working-tree-fixture"}\n',
    ...initialProjectFiles,
  });
  commit(root, 'base');
  const baseRef = 'comparison-base';
  git(root, ['branch', baseRef, 'HEAD']);
  return { root, projectRoot, baseRef };
}

function runFixture(repository, { fixSafe }) {
  return runWorkingTreeQuality({
    baseRef: repository.baseRef,
    fixSafe,
    projectRoot: repository.projectRoot,
    outputRoot: path.join(repository.projectRoot, 'reports/quality/working-tree'),
    toolRoot,
  });
}

function writeFiles(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}

function readFixture(repository, relativePath) {
  return readFileSync(path.join(repository.projectRoot, relativePath), 'utf8');
}

function commit(repositoryRoot, message) {
  git(repositoryRoot, ['add', '-A']);
  git(repositoryRoot, ['commit', '-q', '-m', message]);
}

function git(repositoryRoot, arguments_) {
  return execFileSync('git', arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

function projectPath(relativePath) {
  return `packages/example/${relativePath}`;
}
