import {
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from '../../../../languages/typescript/adapters/static-checks/dependencies.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { withWaitedLock } from '../../../tooling/file-lock.mts';
import type { SharedWorktree } from './run-types.mts';

type PreparedRoots = {
  readonly baseProjectRoot: string;
  readonly headSnapshotRoot: string;
  readonly liveProjectRoot: string;
  readonly toolRoot: string;
  readonly sharedBase?: SharedWorktree | undefined;
  readonly sharedHead?: SharedWorktree | undefined;
};

type Preparation = {
  readonly projectRoot: string;
  readonly liveProjectRoot: string;
  readonly toolRoot: string;
};

const prepare: (options: Preparation & { readonly reuseExisting?: true }) => unknown =
  prepareSnapshotDependencies;

const SHARED_PREPARATION_TIMEOUT_MS = 10 * 60 * 1000;

export function prepareShared(
  options: Preparation,
  shared: SharedWorktree | undefined,
  side: string,
): unknown {
  if (shared === undefined) {
    return prepare(options);
  }
  const describe = `the ${side} dependencies another project prepares did not become ready`;
  withWaitedLock(shared.lockPath, { timeoutMs: SHARED_PREPARATION_TIMEOUT_MS, describe }, () =>
    prepare({ ...options, reuseExisting: true }),
  );
  return undefined;
}
const remove: (dependencies: unknown) => unknown = removeSnapshotDependencies;

function requiresPreparedDependencies(analyzers: readonly unknown[]): boolean {
  return analyzers.some((analyzer) => fieldOf(analyzer, 'requiresDependencies') === true);
}

function withPreparedAnalyzerDependencies<T>(roots: PreparedRoots, operation: () => T): T {
  const { headSnapshotRoot, liveProjectRoot, toolRoot } = roots;
  const preparedDependencies: unknown[] = [];
  try {
    const { baseProjectRoot, sharedBase, sharedHead } = roots;
    const baseDependencies = prepareShared(
      { projectRoot: baseProjectRoot, liveProjectRoot, toolRoot },
      sharedBase,
      'base',
    );
    if (baseDependencies !== undefined) {
      preparedDependencies.push(baseDependencies);
    }
    const headDependencies = prepareShared(
      { projectRoot: headSnapshotRoot, liveProjectRoot, toolRoot },
      sharedHead,
      'head',
    );
    if (headDependencies !== undefined) {
      preparedDependencies.push(headDependencies);
    }

    return operation();
  } finally {
    for (const dependencies of preparedDependencies.reverse()) {
      remove(dependencies);
    }
  }
}

export function withPreparedDependencies<T>(
  analyzers: readonly unknown[],
  roots: PreparedRoots,
  operation: () => T,
): T {
  return requiresPreparedDependencies(analyzers)
    ? withPreparedAnalyzerDependencies(roots, operation)
    : operation();
}
