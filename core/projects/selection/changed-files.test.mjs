import { rmSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { commit, fixtureGit, useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { changedFiles } from './changed-files.mjs';

const git = useGitFixtures();

describe('changedFiles', () => {
  it('lists committed, staged, unstaged, deleted and untracked changes against the merge base', () => {
    const { root, baseSha } = git.createGitRepository(
      { 'a.txt': '1', 'b.txt': '1', 'c.txt': '1', 'd/e.txt': '1' },
      { prefix: 'nitpicker-changed-' },
    );
    writeFiles(root, { 'a.txt': '2' });
    commit(root, 'edit a');
    writeFiles(root, { 'b.txt': '2', 'staged.txt': 'x' });
    fixtureGit(root, ['add', 'staged.txt']);
    rmSync(path.join(root, 'c.txt'));
    writeFiles(root, { 'untracked/f.txt': 'x' });

    expect(changedFiles({ repositoryRoot: root, mergeBaseSha: baseSha })).toEqual([
      'a.txt',
      'b.txt',
      'c.txt',
      'staged.txt',
      'untracked/f.txt',
    ]);
  });

  it('reports a rename as the old and the new path', () => {
    const { root, baseSha } = git.createGitRepository(
      { 'old/name.txt': 'some content long enough to match' },
      { prefix: 'nitpicker-changed-' },
    );
    fixtureGit(root, ['mv', 'old/name.txt', 'new-name.txt']);

    expect(changedFiles({ repositoryRoot: root, mergeBaseSha: baseSha })).toEqual([
      'new-name.txt',
      'old/name.txt',
    ]);
  });

  it('is empty for a clean checkout', () => {
    const { root, baseSha } = git.createGitRepository(
      { 'a.txt': '1' },
      { prefix: 'nitpicker-changed-' },
    );

    expect(changedFiles({ repositoryRoot: root, mergeBaseSha: baseSha })).toEqual([]);
  });
});
