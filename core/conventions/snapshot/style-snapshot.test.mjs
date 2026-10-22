import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fixtureGit, useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { lazyConfigRoot } from '../style-snapshot.mjs';

const { createGitRepository } = useGitFixtures();

function snapshotOf(files, options) {
  return snapshotOfRepository(createGitRepository(files).root, options);
}

function snapshotOfRepository(root, { projectDirectory = '', named = [] } = {}) {
  const commitSha = fixtureGit(root, ['rev-parse', 'HEAD']).trim();
  return lazyConfigRoot({
    projectRoot: path.join(root, projectDirectory),
    commit: () => ({ repositoryRoot: root, commitSha }),
    useBase: () => true,
    named,
  });
}

function copiedFiles(directory) {
  return readdirSync(directory, { recursive: true })
    .filter((entry) => statSync(path.join(directory, entry)).isFile())
    .map((entry) => entry.split(path.sep).join('/'))
    .sort();
}

describe('the copy of the style files of the merge base', () => {
  it('copies the known config names of the project and its parents, and nothing else', () => {
    const snapshot = snapshotOf(
      {
        'ruff.toml': 'line-length = 100\n',
        'unrelated.yaml': 'a: 1\n',
        'app/pyproject.toml': '[tool.ruff]\n',
        'app/.editorconfig': 'root = true\n',
        'app/config/detekt/detekt.yml': 'style:\n',
        'app/charts/values.yaml': 'a: 1\n',
        'app/src/a.py': 'x = 1\n',
        'other/ruff.toml': 'line-length = 50\n',
      },
      { projectDirectory: 'app' },
    );
    const { path: projectPath } = snapshot.get();

    expect(copiedFiles(path.dirname(projectPath))).toEqual([
      'app/.editorconfig',
      'app/config/detekt/detekt.yml',
      'app/pyproject.toml',
      'ruff.toml',
    ]);
    expect(existsSync(path.join(path.dirname(projectPath), '.git'))).toBe(true);
    snapshot.dispose();
    expect(existsSync(path.dirname(projectPath))).toBe(false);
  });

  it('copies the files that an extend chain names, and the file the config names', () => {
    const snapshot = snapshotOf(
      {
        'ruff.toml': 'extend = "shared/base.toml"\n',
        'shared/base.toml': 'extend = "../common/root.toml"\nline-length = 100\n',
        'common/root.toml': 'indent-width = 2\n',
        'shared/other.toml': 'x = 1\n',
        'custom/lint.yaml': 'style:\n',
      },
      { named: ['custom/lint.yaml'] },
    );

    expect(copiedFiles(snapshot.get().path)).toEqual([
      'common/root.toml',
      'custom/lint.yaml',
      'ruff.toml',
      'shared/base.toml',
    ]);
    snapshot.dispose();
  });

  it('keeps the config in a repository with thousands of yaml files', () => {
    const many = Object.fromEntries(
      Array.from({ length: 1200 }, (_, index) => [`charts/c${String(index)}.yaml`, 'a: 1\n']),
    );
    const snapshot = snapshotOf({ 'ruff.toml': 'line-length = 100\n', ...many });

    expect(copiedFiles(snapshot.get().path)).toEqual(['ruff.toml']);
    snapshot.dispose();
  });

  it('fails loudly instead of dropping config files beyond its limit', () => {
    const many = Object.fromEntries(
      Array.from({ length: 1001 }, (_, index) => [
        `m${String(index)}/.editorconfig`,
        'root=true\n',
      ]),
    );
    const snapshot = snapshotOf(many);

    expect(() => snapshot.get()).toThrow(
      'Found 1001 style files under the repository, more than the 1000 that nitpicker copies from the merge base: run it from a narrower project folder',
    );
  });

  it('works with a relative temporary directory', () => {
    const snapshot = snapshotOf({ 'ruff.toml': 'line-length = 100\n' });
    const relative = path.basename(mkdtempSync(path.join(process.cwd(), '.style-snapshot-')));
    vi.stubEnv('TMPDIR', relative);

    try {
      expect(path.isAbsolute(snapshot.get().path)).toBe(true);
      expect(copiedFiles(snapshot.get().path)).toEqual(['ruff.toml']);
    } finally {
      snapshot.dispose();
      vi.unstubAllEnvs();
      rmSync(relative, { recursive: true, force: true });
    }
  });

  it('says which files it left out because the system cannot hold their names', () => {
    const { root } = createGitRepository({
      '.editorconfig': 'root = true\n',
      'a:b/.editorconfig': 'x\n',
      'con/.editorconfig': 'x\n',
    });
    const longName = `${'n'.repeat(300)}/.editorconfig`;
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], {
      cwd: root,
      input: 'x\n',
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    }).trim();
    fixtureGit(root, ['update-index', '--add', '--cacheinfo', `100644,${blob},${longName}`]);
    fixtureGit(root, ['commit', '-q', '-m', 'long']);
    const snapshot = snapshotOfRepository(root);

    expect(copiedFiles(snapshot.get().path)).toEqual(['.editorconfig']);
    expect(snapshot.notes()).toEqual([
      `Could not copy these style files from the merge base: a:b/.editorconfig: a name contains ':', con/.editorconfig: a name is reserved, ${longName}: a name is too long`,
    ]);
    snapshot.dispose();
  });
});
