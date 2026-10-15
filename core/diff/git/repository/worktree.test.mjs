import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../test-support/git-repository.mjs';
import { withNamedTemporaryWorktree, withTemporaryWorktree } from './worktree.mjs';

const { createGitRepository } = useGitFixtures();

describe('withTemporaryWorktree', () => {
  it('names the checked-out side in the directory the analyzers will print', () => {
    const repository = createGitRepository({ 'a.txt': 'a\n' });

    const base = withTemporaryWorktree(repository.root, repository.baseSha, (root) => root);
    const head = withNamedTemporaryWorktree(
      repository.root,
      { commitSha: repository.baseSha, directoryName: 'head' },
      (root) => root,
    );

    expect(path.basename(base)).toBe('base');
    expect(path.basename(head)).toBe('head');
    expect(path.basename(path.dirname(head))).toMatch(/^nitpicker-diff-/u);
  });
});
