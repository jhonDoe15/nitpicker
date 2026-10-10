import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runGit } from './git.mjs';

export function withTemporaryWorktree(repositoryRoot, commitSha, operation) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-'));
  const worktreeRoot = path.join(temporaryRoot, 'base');
  let worktreeCreated = false;
  let operationError;

  try {
    runGit(repositoryRoot, ['worktree', 'add', '--detach', worktreeRoot, commitSha]);
    worktreeCreated = true;
    return operation(worktreeRoot);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    let cleanupError;
    if (worktreeCreated) {
      try {
        runGit(repositoryRoot, ['worktree', 'remove', '--force', worktreeRoot]);
      } catch (error) {
        cleanupError = error;
      }
    }
    rmSync(temporaryRoot, { recursive: true, force: true });

    if (cleanupError !== undefined) {
      if (operationError !== undefined) {
        throw new AggregateError(
          [operationError, cleanupError],
          'Quality comparison and temporary worktree cleanup both failed',
        );
      }
      throw new Error('Failed to remove the temporary quality-comparison worktree', {
        cause: cleanupError,
      });
    }
  }
}
