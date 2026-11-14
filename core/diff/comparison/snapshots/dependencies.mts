import {
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from '../../../../languages/typescript/adapters/static-checks/dependencies.mjs';
import { fieldOf } from '../../../../shared/values/readers.mts';

type PreparedRoots = {
  readonly baseProjectRoot: string;
  readonly headSnapshotRoot: string;
  readonly liveProjectRoot: string;
  readonly toolRoot: string;
};

const prepare: (options: {
  readonly projectRoot: string;
  readonly liveProjectRoot: string;
  readonly toolRoot: string;
}) => unknown = prepareSnapshotDependencies;
const remove: (dependencies: unknown) => unknown = removeSnapshotDependencies;

function requiresPreparedDependencies(analyzers: readonly unknown[]): boolean {
  return analyzers.some((analyzer) => fieldOf(analyzer, 'requiresDependencies') === true);
}

function withPreparedAnalyzerDependencies<T>(
  { baseProjectRoot, headSnapshotRoot, liveProjectRoot, toolRoot }: PreparedRoots,
  operation: () => T,
): T {
  const preparedDependencies: unknown[] = [];
  try {
    const baseDependencies = prepare({ projectRoot: baseProjectRoot, liveProjectRoot, toolRoot });
    if (baseDependencies !== undefined) {
      preparedDependencies.push(baseDependencies);
    }
    const headDependencies = prepare({ projectRoot: headSnapshotRoot, liveProjectRoot, toolRoot });
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
