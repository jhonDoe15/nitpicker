import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { runGit } from './command.mjs';
import { realTemporaryDirectory } from '../../../tooling/temporary-files.mjs';
import { firstErrorLine } from '../../../../shared/messages/error-chain.mjs';

const REMOVAL_RETRIES = 10;
const REMOVAL_RETRY_DELAY_MS = 100;

export const TEMPORARY_WORKTREE_PREFIX = 'nitpicker-diff-';

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

function addWorktree(repositoryRoot, { commitSha, directoryName }) {
  const temporaryRoot = mkdtempSync(path.join(realTemporaryDirectory(), TEMPORARY_WORKTREE_PREFIX));
  const worktreeRoot = path.join(temporaryRoot, directoryName);
  const added = attempt(() =>
    runGit(repositoryRoot, ['worktree', 'add', '--detach', worktreeRoot, commitSha]),
  );
  function remove() {
    const cleanupError = removeWorktree(repositoryRoot, {
      worktreeRoot,
      temporaryRoot,
      created: added.ok,
    });
    return cleanupError === undefined ? undefined : leftoverWarning(temporaryRoot, cleanupError);
  }
  return { added, worktreeRoot, temporaryRoot, remove };
}

export function addTemporaryWorktree(repositoryRoot, { commitSha, directoryName }) {
  const worktree = addWorktree(repositoryRoot, { commitSha, directoryName });
  if (!worktree.added.ok) {
    worktree.remove();
    throw worktree.added.error;
  }
  return worktree;
}

export function withNamedTemporaryWorktree(
  repositoryRoot,
  { commitSha, directoryName, warn },
  operation,
) {
  const worktree = addWorktree(repositoryRoot, { commitSha, directoryName });
  const outcome = worktree.added.ok
    ? attempt(() => operation(worktree.worktreeRoot))
    : worktree.added;
  const warning = worktree.remove();
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
