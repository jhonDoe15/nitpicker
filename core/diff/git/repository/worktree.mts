import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { runGit } from './command.mts';
import { realTemporaryDirectory } from '../../../tooling/temporary-files.mts';
import { firstErrorLine } from '../../../../shared/messages/error-chain.mjs';

const REMOVAL_RETRIES = 10;
const REMOVAL_RETRY_DELAY_MS = 100;

export const TEMPORARY_WORKTREE_PREFIX = 'nitpicker-diff-';

type Attempt<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown };

type Worktree = {
  readonly added: Attempt<string>;
  readonly worktreeRoot: string;
  readonly temporaryRoot: string;
  readonly remove: () => string | undefined;
};

type WorktreeRequest = { readonly commitSha: string; readonly directoryName: string };

function attempt<T>(operation: () => T): Attempt<T> {
  try {
    return { ok: true, value: operation() };
  } catch (error) {
    return { ok: false, error };
  }
}

function unregisterWorktree(repositoryRoot: string, worktreeRoot: string): void {
  const removed = attempt(() =>
    runGit(repositoryRoot, ['worktree', 'remove', '--force', worktreeRoot]),
  );
  if (!removed.ok) {
    runGit(repositoryRoot, ['worktree', 'prune']);
  }
}

function removeWorktree(
  repositoryRoot: string,
  {
    worktreeRoot,
    temporaryRoot,
    created,
  }: { readonly worktreeRoot: string; readonly temporaryRoot: string; readonly created: boolean },
): unknown {
  const removed: Attempt<unknown> = created
    ? attempt(() => runGit(repositoryRoot, ['worktree', 'remove', '--force', worktreeRoot]))
    : { ok: true, value: undefined };
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
  const unregistered = attempt(() => {
    unregisterWorktree(repositoryRoot, worktreeRoot);
  });
  return unregistered.ok ? undefined : unregistered.error;
}

const firstLine: (error: unknown) => string = firstErrorLine;

function leftoverWarning(temporaryRoot: string, error: unknown): string {
  return `could not remove the temporary worktree ${temporaryRoot} (${firstLine(error)}); delete it and run git worktree prune once the build has stopped`;
}

export function withTemporaryWorktree<T>(
  repositoryRoot: string,
  {
    commitSha,
    warn,
  }: { readonly commitSha: string; readonly warn: ((message: string) => void) | undefined },
  operation: (worktreeRoot: string) => T,
): T {
  return withNamedTemporaryWorktree(
    repositoryRoot,
    { commitSha, directoryName: 'base', warn },
    operation,
  );
}

function addWorktree(
  repositoryRoot: string,
  { commitSha, directoryName }: WorktreeRequest,
): Worktree {
  const temporaryRoot = mkdtempSync(path.join(realTemporaryDirectory(), TEMPORARY_WORKTREE_PREFIX));
  const worktreeRoot = path.join(temporaryRoot, directoryName);
  const added = attempt(() =>
    runGit(repositoryRoot, ['worktree', 'add', '--detach', worktreeRoot, commitSha]),
  );
  function remove(): string | undefined {
    const cleanupError = removeWorktree(repositoryRoot, {
      worktreeRoot,
      temporaryRoot,
      created: added.ok,
    });
    return cleanupError === undefined ? undefined : leftoverWarning(temporaryRoot, cleanupError);
  }
  return { added, worktreeRoot, temporaryRoot, remove };
}

export function addTemporaryWorktree(
  repositoryRoot: string,
  { commitSha, directoryName }: WorktreeRequest,
): Worktree {
  const worktree = addWorktree(repositoryRoot, { commitSha, directoryName });
  if (!worktree.added.ok) {
    worktree.remove();
    throw worktree.added.error;
  }
  return worktree;
}

export function withNamedTemporaryWorktree<T>(
  repositoryRoot: string,
  {
    commitSha,
    directoryName,
    warn,
  }: WorktreeRequest & { readonly warn: ((message: string) => void) | undefined },
  operation: (worktreeRoot: string) => T,
): T {
  const worktree = addWorktree(repositoryRoot, { commitSha, directoryName });
  const outcome = worktree.added.ok
    ? attempt(() => operation(worktree.worktreeRoot))
    : worktree.added;
  const warning = worktree.remove();
  if (!outcome.ok) {
    attempt(() => {
      if (warning !== undefined) {
        warn?.(warning);
      }
    });
    throw outcome.error;
  }
  if (warning !== undefined) {
    warn?.(warning);
  }
  return outcome.value;
}
