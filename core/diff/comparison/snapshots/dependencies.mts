import {
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from '../../../../languages/typescript/adapters/static-checks/dependencies.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { withWaitedLock } from '../../../tooling/file-lock.mts';
import type { SharedWorktree } from '../quick/head-run.mts';

type PreparedRoots = {
  readonly baseProjectRoot: string;
  readonly headSnapshotRoot: string;
  readonly liveProjectRoot: string;
  readonly toolRoot: string;
  readonly sharedBase?: SharedWorktree | undefined;
};

const prepare: (options: {
  readonly projectRoot: string;
  readonly liveProjectRoot: string;
  readonly toolRoot: string;
  readonly reuseExisting?: true;
}) => unknown = prepareSnapshotDependencies;

const SHARED_PREPARATION_TIMEOUT_MS = 10 * 60 * 1000;

function prepareBase({
  baseProjectRoot,
  liveProjectRoot,
  toolRoot,
  sharedBase,
}: PreparedRoots): unknown {
  const options = { projectRoot: baseProjectRoot, liveProjectRoot, toolRoot };
  if (sharedBase === undefined) {
    return prepare(options);
  }
  const describe = 'the base dependencies another project prepares did not become ready';
  withWaitedLock(sharedBase.lockPath, { timeoutMs: SHARED_PREPARATION_TIMEOUT_MS, describe }, () =>
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
    const baseDependencies = prepareBase(roots);
    if (baseDependencies !== undefined) {
      preparedDependencies.push(baseDependencies);
    }
    const headDependencies = prepare({
      projectRoot: headSnapshotRoot,
      liveProjectRoot,
      toolRoot,
    });
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
