import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runGit } from './git.mjs';

function attempt(operation) {
  try {
    return { ok: true, value: operation() };
  } catch (error) {
    return { ok: false, error };
  }
}

function removeWorktree(repositoryRoot, { worktreeRoot, temporaryRoot, created }) {
  try {
    if (created) {
      runGit(repositoryRoot, ['worktree', 'remove', '--force', worktreeRoot]);
    }
    return undefined;
  } catch (error) {
    return error;
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function cleanupFailure(outcome, cleanupError) {
  if (!outcome.ok) {
    return new AggregateError(
      [outcome.error, cleanupError],
      'Quality comparison and temporary worktree cleanup both failed',
    );
  }
  return new Error('Failed to remove the temporary quality-comparison worktree', {
    cause: cleanupError,
  });
}

export function withTemporaryWorktree(repositoryRoot, commitSha, operation) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-'));
  const worktreeRoot = path.join(temporaryRoot, 'base');
  const added = attempt(() =>
    runGit(repositoryRoot, ['worktree', 'add', '--detach', worktreeRoot, commitSha]),
  );
  const outcome = added.ok ? attempt(() => operation(worktreeRoot)) : added;
  const cleanupError = removeWorktree(repositoryRoot, {
    worktreeRoot,
    temporaryRoot,
    created: added.ok,
  });
  if (cleanupError !== undefined) {
    throw cleanupFailure(outcome, cleanupError);
  }
  if (!outcome.ok) {
    throw outcome.error;
  }
  return outcome.value;
}
