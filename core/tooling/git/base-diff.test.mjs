import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runGit } from '../../diff/git/repository/command.mjs';
import { fixtureGit, useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { diffFromBase } from './base-diff.mjs';

const { createGitRepository } = useGitFixtures();

function repositoryWithBaseWorktree() {
  const { root } = createGitRepository({ 'app/a.txt': 'one\n', 'app/b.txt': 'two\n' });
  const baselineRoot = path.join(root, '.base-worktree');
  fixtureGit(root, ['worktree', 'add', '-q', '--detach', '.base-worktree', 'HEAD']);
  writeFileSync(path.join(root, 'app/a.txt'), 'one\nextra\n');
  mkdirSync(path.join(root, 'app/ünï'), { recursive: true });
  writeFileSync(path.join(root, 'app/ünï/c.txt'), 'new\n');
  fixtureGit(root, ['add', '-A', '--', ':!.base-worktree']);
  fixtureGit(root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'head']);
  return { root, baselineRoot };
}

describe('diffFromBase', () => {
  it('lists the changes between the baseline checkout and head, unquoted', () => {
    const { root, baselineRoot } = repositoryWithBaseWorktree();

    expect(
      diffFromBase({
        runGit,
        baselineRoot,
        projectRoot: root,
        args: ['--name-status', '--no-renames'],
        pathspec: ['--', ':/'],
      }),
    ).toBe('M\tapp/a.txt\nA\tapp/ünï/c.txt\n');
  });

  it('limits the diff to the project folder and makes paths relative to it', () => {
    const { root, baselineRoot } = repositoryWithBaseWorktree();

    expect(
      diffFromBase({
        runGit,
        baselineRoot,
        projectRoot: path.join(root, 'app'),
        args: ['--name-status', '--relative'],
      }),
    ).toBe('M\ta.txt\nA\tünï/c.txt\n');
  });

  it('fails when the baseline is not a git checkout', () => {
    const { root } = repositoryWithBaseWorktree();

    expect(() =>
      diffFromBase({
        runGit,
        baselineRoot: path.join(root, 'missing'),
        projectRoot: root,
        args: [],
      }),
    ).toThrow(/ENOENT|failed/);
  });
});
