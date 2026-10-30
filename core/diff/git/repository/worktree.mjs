import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runGit } from './command.mjs';
import { firstErrorLine } from '../../../../shared/messages/error-chain.mjs';

const REMOVAL_RETRIES = 10;
const REMOVAL_RETRY_DELAY_MS = 100;

function attempt(operation) {
  try {
    return { ok: true, value: operation() };
  } catch (error) {
    return { ok: false, error };
  }
}

function unregisterWorktree(repositoryRoot, worktreeRoot) {
  const removed = attempt(() =>
    runGit(repositoryRoot, ['worktree', 'remove', '--force', worktreeRoot]),
  );
  if (!removed.ok) {
    runGit(repositoryRoot, ['worktree', 'prune']);
  }
}

function removeWorktree(repositoryRoot, { worktreeRoot, temporaryRoot, created }) {
  const removed = created
    ? attempt(() => runGit(repositoryRoot, ['worktree', 'remove', '--force', worktreeRoot]))
    : { ok: true };
  const deleted = attempt(() => {
    rmSync(temporaryRoot, {
      recursive: true,
      force: true,
      maxRetries: REMOVAL_RETRIES,
      retryDelay: REMOVAL_RETRY_DELAY_MS,
    });
  });
  if (!deleted.ok) {
    return deleted.error;
  }
  if (removed.ok) {
    return undefined;
  }
  return attempt(() => {
    unregisterWorktree(repositoryRoot, worktreeRoot);
  }).error;
}

function leftoverWarning(temporaryRoot, error) {
  return `could not remove the temporary worktree ${temporaryRoot} (${firstErrorLine(error)}); delete it and run git worktree prune once the build has stopped`;
}

export function withTemporaryWorktree(repositoryRoot, { commitSha, warn }, operation) {
  return withNamedTemporaryWorktree(
    repositoryRoot,
    { commitSha, directoryName: 'base', warn },
    operation,
  );
}

export function withNamedTemporaryWorktree(
  repositoryRoot,
  { commitSha, directoryName, warn },
  operation,
) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-'));
  const worktreeRoot = path.join(temporaryRoot, directoryName);
  const added = attempt(() =>
    runGit(repositoryRoot, ['worktree', 'add', '--detach', worktreeRoot, commitSha]),
  );
  const outcome = added.ok ? attempt(() => operation(worktreeRoot)) : added;
  const cleanupError = removeWorktree(repositoryRoot, {
    worktreeRoot,
    temporaryRoot,
    created: added.ok,
  });
  const warning =
    cleanupError === undefined ? undefined : leftoverWarning(temporaryRoot, cleanupError);
  if (!outcome.ok) {
    attempt(() => {
      if (warning !== undefined) {
        warn(warning);
      }
    });
    throw outcome.error;
  }
  if (warning !== undefined) {
    warn(warning);
  }
  return outcome.value;
}
