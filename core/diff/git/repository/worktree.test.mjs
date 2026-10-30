import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGitFixtures } from '../test-support/git-repository.mjs';
import { withNamedTemporaryWorktree, withTemporaryWorktree } from './worktree.mjs';
import { runGit } from './command.mjs';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, rmSync: vi.fn(actual.rmSync) };
});

const { createGitRepository } = useGitFixtures();
const { rmSync: actualRmSync } = await vi.importActual('node:fs');
const leftovers = [];

afterEach(() => {
  vi.mocked(rmSync).mockImplementation(actualRmSync);
  for (const leftover of leftovers.splice(0)) {
    actualRmSync(leftover, { recursive: true, force: true });
  }
});

function failTemporaryRootRemoval() {
  vi.mocked(rmSync).mockImplementation((target, options) => {
    if (path.basename(target).startsWith('nitpicker-diff-')) {
      leftovers.push(target);
      throw Object.assign(new Error(`ENOTEMPTY: directory not empty, rmdir '${target}/head'`), {
        code: 'ENOTEMPTY',
      });
    }
    return actualRmSync(target, options);
  });
}

function registeredWorktrees(repositoryRoot) {
  return runGit(repositoryRoot, ['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((line) => line.startsWith('worktree '));
}

describe('withTemporaryWorktree', () => {
  it('names the checked-out side in the directory the analyzers will print', () => {
    const repository = createGitRepository({ 'a.txt': 'a\n' });
    const warn = vi.fn();

    const base = withTemporaryWorktree(repository.root, repository.baseSha, (root) => root, {
      warn,
    });
    const head = withNamedTemporaryWorktree(
      repository.root,
      { commitSha: repository.baseSha, directoryName: 'head', warn },
      (root) => root,
    );

    expect(path.basename(base)).toBe('base');
    expect(path.basename(head)).toBe('head');
    expect(path.basename(path.dirname(head))).toMatch(/^nitpicker-diff-/u);
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns the result and warns when the folder cannot be removed after the operation', () => {
    const repository = createGitRepository({ 'a.txt': 'a\n' });
    const warn = vi.fn();
    failTemporaryRootRemoval();

    const result = withTemporaryWorktree(repository.root, repository.baseSha, () => 'report', {
      warn,
    });

    expect(result).toBe('report');
    expect(warn.mock.calls).toEqual([
      [
        `could not remove the temporary worktree ${leftovers[0]} (ENOTEMPTY: directory not empty, rmdir '${leftovers[0]}/head'); delete it and run git worktree prune once the build has stopped`,
      ],
    ]);
  });

  it('throws the operation error first and still warns about the folder left behind', () => {
    const repository = createGitRepository({ 'a.txt': 'a\n' });
    const warn = vi.fn();
    failTemporaryRootRemoval();

    expect(() =>
      withTemporaryWorktree(
        repository.root,
        repository.baseSha,
        () => {
          throw new Error('java timed out after 60000 ms');
        },
        { warn },
      ),
    ).toThrow('java timed out after 60000 ms');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('deletes the folder and unregisters the worktree when git cannot remove it', () => {
    const repository = createGitRepository({ 'a.txt': 'a\n' });
    const warn = vi.fn();

    const worktreeRoot = withTemporaryWorktree(
      repository.root,
      repository.baseSha,
      (root) => {
        writeFileSync(path.join(root, '.git'), 'gitdir: /nonexistent\n');
        return root;
      },
      { warn },
    );

    expect(warn).not.toHaveBeenCalled();
    expect(existsSync(path.dirname(worktreeRoot))).toBe(false);
    expect(registeredWorktrees(repository.root)).toEqual([`worktree ${repository.root}`]);
  });
});
