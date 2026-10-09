import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runGit } from './git.mjs';

export function withTemporaryWorktree(repositoryRoot, commitSha, operation) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-'));
  const worktreeRoot = path.join(temporaryRoot, 'base');
  let worktreeCreated = false;
  let operationError;
  let operationFailed = false;
  let result;

  try {
    runGit(repositoryRoot, ['worktree', 'add', '--detach', worktreeRoot, commitSha]);
    worktreeCreated = true;
    result = operation(worktreeRoot);
  } catch (error) {
    operationError = error;
    operationFailed = true;
  }

  let cleanupError;
  try {
    if (worktreeCreated) {
      try {
        runGit(repositoryRoot, ['worktree', 'remove', '--force', worktreeRoot]);
      } catch (error) {
        cleanupError = error;
      }
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }

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
  if (operationFailed) {
    throw operationError;
  }
  return result;
}
