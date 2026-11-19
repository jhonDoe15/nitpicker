import path from 'node:path';
import { commitOf } from '../../../diff/git/repository/base-ref.mts';
import { captureWorkingTree } from '../../../diff/git/repository/git.mjs';
import { addTemporaryWorktree } from '../../../diff/git/repository/worktree.mjs';
import type { PlanProject, ProjectRow } from '../../project-types.mts';
import type { RunContext, SharedBase } from './project-rows.mts';

type Rows = readonly ProjectRow[] | Promise<readonly ProjectRow[]>;
type Added = {
  readonly worktreeRoot: string;
  readonly temporaryRoot: string;
  readonly remove: () => string | undefined;
};
type Checkout = {
  readonly repositoryRoot: string;
  readonly commitSha: string;
  readonly directoryName: string;
};

const captured: (repositoryRoot: string, headSha: string) => string = captureWorkingTree;
const addWorktree: (
  repositoryRoot: string,
  request: { readonly commitSha: string; readonly directoryName: string },
) => Added = addTemporaryWorktree;

async function releasedWhenSettled(
  pending: Promise<readonly ProjectRow[]>,
  release: () => void,
): Promise<readonly ProjectRow[]> {
  try {
    return await pending;
  } finally {
    release();
  }
}

function releasedAfter(rows: Rows, release: () => void): Rows {
  if (rows instanceof Promise) {
    return releasedWhenSettled(rows, release);
  }
  release();
  return rows;
}

export function sharedCheckout(
  { repositoryRoot, commitSha, directoryName }: Checkout,
  context: RunContext,
  run: (added: Added) => Rows,
): Rows {
  const added = addWorktree(repositoryRoot, { commitSha, directoryName });
  function release(): void {
    const warning = added.remove();
    if (warning !== undefined) {
      context.cli.stderr.write(`nitpicker: ${warning}\n`);
    }
  }
  try {
    return releasedAfter(run(added), release);
  } catch (error) {
    release();
    throw error;
  }
}

export function sharedWorktreeOf(
  added: Added,
  commitSha: string,
  sharers: readonly PlanProject[],
): SharedBase {
  return {
    worktree: {
      root: added.worktreeRoot,
      commitSha,
      lockPath: path.join(added.temporaryRoot, 'dependencies.lock'),
    },
    sharers: new Set(sharers.map(({ path: folder }) => folder)),
  };
}

export function withSharedHead(
  {
    repositoryRoot,
    sharers,
  }: { readonly repositoryRoot: string; readonly sharers: readonly PlanProject[] },
  context: RunContext,
  run: (context: RunContext) => Rows,
): Rows {
  const headSha = commitOf(repositoryRoot, 'HEAD');
  if (context.cli.options.staged || sharers.length < 2 || headSha === undefined) {
    return run(context);
  }
  const commitSha = captured(repositoryRoot, headSha);
  return sharedCheckout({ repositoryRoot, commitSha, directoryName: 'head' }, context, (added) =>
    run({ ...context, sharedHead: sharedWorktreeOf(added, commitSha, sharers) }),
  );
}
