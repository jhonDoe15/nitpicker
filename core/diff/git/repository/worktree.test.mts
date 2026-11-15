import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGitFixtures } from '../test-support/git-repository.mts';
import {
  withNamedTemporaryWorktree as withNamedWorktreeJs,
  withTemporaryWorktree as withWorktreeJs,
} from './worktree.mjs';
import { runGit as runGitJs } from './command.mjs';

type Warn = (message: string) => unknown;

const withTemporaryWorktree: <Result>(
  repositoryRoot: string,
  options: { readonly commitSha: string; readonly warn: Warn },
  operation: (root: string) => Result,
) => Result = withWorktreeJs;
const withNamedTemporaryWorktree: <Result>(
  repositoryRoot: string,
  options: { readonly commitSha: string; readonly directoryName: string; readonly warn: Warn },
  operation: (root: string) => Result,
) => Result = withNamedWorktreeJs;
const runGit: (repositoryRoot: string, args: readonly string[]) => string = runGitJs;
type FsRemoval = { readonly rmSync: typeof rmSync };

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<FsRemoval>();
  return { ...actual, rmSync: vi.fn(actual.rmSync) };
});

const { createGitRepository } = useGitFixtures();
const { rmSync: actualRmSync } = await vi.importActual<FsRemoval>('node:fs');
const leftovers: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(rmSync).mockImplementation(actualRmSync);
  for (const leftover of leftovers.splice(0)) {
    actualRmSync(leftover, { recursive: true, force: true });
  }
});

function failTemporaryRootRemoval() {
  vi.mocked(rmSync).mockImplementation((target, options) => {
    const targetPath = String(target);
    if (!path.basename(targetPath).startsWith('nitpicker-diff-')) {
      actualRmSync(target, options);
      return;
    }
    leftovers.push(targetPath);
    throw Object.assign(new Error(`ENOTEMPTY: directory not empty, rmdir '${targetPath}/head'`), {
      code: 'ENOTEMPTY',
    });
  });
}

function registeredWorktrees(repositoryRoot: string): string[] {
  return runGit(repositoryRoot, ['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((line) => line.startsWith('worktree '));
}

describe('withTemporaryWorktree', () => {
  it('names the checked-out side in the directory the analyzers will print', () => {
    const repository = createGitRepository({ 'a.txt': 'a\n' });
    const warn = vi.fn();

    const base = withTemporaryWorktree(
      repository.root,
      { commitSha: repository.baseSha, warn },
      (root: string) => root,
    );
    const head = withNamedTemporaryWorktree(
      repository.root,
      { commitSha: repository.baseSha, directoryName: 'head', warn },
      (root: string) => root,
    );

    expect(path.basename(base)).toBe('base');
    expect(path.basename(head)).toBe('head');
    expect(path.basename(path.dirname(head))).toMatch(/^nitpicker-diff-/u);
    expect(warn).not.toHaveBeenCalled();
  });

  it('hands the analyzers the real path when the temp folder is reached through a link', () => {
    const repository = createGitRepository({ 'a.txt': 'a\n' });
    const scratch = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'nitpicker-link-')));
    leftovers.push(scratch);
    const realTemp = path.join(scratch, 'real');
    const linkedTemp = path.join(scratch, 'linked');
    mkdirSync(realTemp);
    symlinkSync(realTemp, linkedTemp, 'junction');
    for (const name of ['TMPDIR', 'TMP', 'TEMP']) {
      vi.stubEnv(name, linkedTemp);
    }

    const root = withTemporaryWorktree(
      repository.root,
      { commitSha: repository.baseSha, warn: vi.fn() },
      (worktreeRoot: string) => worktreeRoot,
    );

    expect(path.dirname(path.dirname(root))).toBe(realTemp);
  });

  it('returns the result and warns when the folder cannot be removed after the operation', () => {
    const repository = createGitRepository({ 'a.txt': 'a\n' });
    const warn = vi.fn();
    failTemporaryRootRemoval();

    const result = withTemporaryWorktree(
      repository.root,
      { commitSha: repository.baseSha, warn },
      () => 'report',
    );

    expect(result).toBe('report');
    expect(warn.mock.calls).toEqual([
      [
        `could not remove the temporary worktree ${String(leftovers[0])} (ENOTEMPTY: directory not empty, rmdir '${String(leftovers[0])}/head'); delete it and run git worktree prune once the build has stopped`,
      ],
    ]);
  });

  it('throws the operation error first and still warns about the folder left behind', () => {
    const repository = createGitRepository({ 'a.txt': 'a\n' });
    const warn = vi.fn();
    failTemporaryRootRemoval();

    expect(() =>
      withTemporaryWorktree(repository.root, { commitSha: repository.baseSha, warn }, () => {
        throw new Error('java timed out after 60000 ms');
      }),
    ).toThrow('java timed out after 60000 ms');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('deletes the folder and unregisters the worktree when git cannot remove it', () => {
    const repository = createGitRepository({ 'a.txt': 'a\n' });
    const warn = vi.fn();

    const worktreeRoot = withTemporaryWorktree(
      repository.root,
      { commitSha: repository.baseSha, warn },
      (root: string) => {
        writeFileSync(path.join(root, '.git'), 'gitdir: /nonexistent\n');
        return root;
      },
    );

    expect(warn).not.toHaveBeenCalled();
    expect(existsSync(path.dirname(worktreeRoot))).toBe(false);
    expect(registeredWorktrees(repository.root)).toEqual([`worktree ${repository.root}`]);
  });
});
