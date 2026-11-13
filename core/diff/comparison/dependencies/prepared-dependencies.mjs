import { PACKAGE_ROOT } from '../../../tooling/tool-resolution.mjs';
import {
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from '../../../../languages/typescript/adapters/static-checks/dependencies.mjs';

export function requiresPreparedDependencies(analyzers) {
  return analyzers.some(
    (analyzer) =>
      typeof analyzer === 'object' && analyzer !== null && analyzer.requiresDependencies === true,
  );
}

export function withPreparedAnalyzerDependencies(
  { baseProjectRoot, headSnapshotRoot, liveProjectRoot },
  operation,
) {
  const preparedDependencies = [];
  try {
    const baseDependencies = prepareSnapshotDependencies({
      projectRoot: baseProjectRoot,
      liveProjectRoot,
      toolRoot: PACKAGE_ROOT,
    });
    if (baseDependencies !== undefined) {
      preparedDependencies.push(baseDependencies);
    }
    const headDependencies = prepareSnapshotDependencies({
      projectRoot: headSnapshotRoot,
      liveProjectRoot,
      toolRoot: PACKAGE_ROOT,
    });
    if (headDependencies !== undefined) {
      preparedDependencies.push(headDependencies);
    }

    return operation();
  } finally {
    for (const dependencies of preparedDependencies.reverse()) {
      removeSnapshotDependencies(dependencies);
    }
  }
}
