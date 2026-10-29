import {
  isStrictRule,
  mustMeetOnEditedLines,
} from '../../../languages/typescript/preset/strict-rules.mjs';
import { writeDiffReports } from '../reporting/reporters.mjs';
import path from 'node:path';
import { resolveComparison, captureWorkingTree } from '../git/repository/git.mjs';
import { readRepositoryChanges } from '../git/patches/changes.mjs';
import {
  resolveBaseProjectPath,
  readProjectMoves,
  readTouchedPaths,
} from '../git/patches/project-moves.mjs';
import { readChangedLines } from '../git/patches/changed-lines.mjs';
import { readRemovesTests } from '../git/patches/test-removal.mjs';
import { withTemporaryWorktree, withNamedTemporaryWorktree } from '../git/repository/worktree.mjs';
import { withHeadPolicyFile } from '../../../languages/typescript/preset/head-policy.mjs';
import { runAnalyzers } from '../execution/run-analyzers.mjs';
import { withMovesFile } from '../git/patches/moves-file.mjs';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import { combineAnalyzerReports } from './results.mjs';
import { runBaseWithCache, createFindingsCache } from '../cache/findings-cache.mjs';
import { cachedLine } from '../execution/progress.mjs';
import {
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from '../../../languages/typescript/adapters/static-checks/dependencies.mjs';

export function runQualityDiff(options) {
  const settings = withDefaults(options);
  const startedAt = Date.now();
  const comparison = resolveSnapshots(settings);
  const layout = readSnapshotLayout(settings, comparison);
  const report = withSnapshotRoots({ settings, comparison, layout }, (roots) =>
    compareSnapshots({ settings, comparison, layout, roots, startedAt }),
  );
  report.summary.elapsedMs = Date.now() - startedAt;
  report.text = writeDiffReports(settings.outputRoot, report, {
    projectPath: settings.projectRelativePath,
  });
  return report;
}

function withDefaults(options) {
  const given = Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  );
  return {
    headProjectRoot: path.join(options.repositoryRoot, options.projectRelativePath),
    includeWorkingTree: false,
    additionalToolErrors: [],
    configOverrides: [],
    headPolicy: {},
    ...given,
  };
}

function resolveSnapshots({ repositoryRoot, requestedBaseRef, includeWorkingTree }) {
  const committed = resolveComparison(repositoryRoot, requestedBaseRef);
  return includeWorkingTree
    ? { ...committed, headSha: captureWorkingTree(repositoryRoot, committed.headSha) }
    : committed;
}

function readSnapshotLayout({ repositoryRoot, projectRelativePath }, comparison) {
  const { mergeBaseSha, headSha } = comparison;
  const changes = readRepositoryChanges({ repositoryRoot, mergeBaseSha, headSha });
  const baseProjectRelativePath = resolveBaseProjectPath({
    repositoryRoot,
    mergeBaseSha,
    headSha,
    projectRelativePath,
    changes,
  });
  const moves = readProjectMoves({
    repositoryRoot,
    mergeBaseSha,
    headSha,
    projectRelativePath,
    baseProjectRelativePath,
    changes,
  });
  const changedLines = readChangedLines({
    repositoryRoot,
    mergeBaseSha,
    headSha,
    projectRelativePath,
    baseProjectRelativePath,
    inferredMoves: moves.inferred,
  });
  const touchedPaths = readTouchedPaths({ projectRelativePath, baseProjectRelativePath, changes });
  return {
    baseProjectRelativePath,
    moves,
    touchedPaths,
    touchedCode: {
      changedLines,
      isStrictRule,
      mustMeetOnEditedLines,
      testsRemoved: readRemovesTests({
        repositoryRoot,
        mergeBaseSha,
        headSha,
        projectRelativePath,
        baseProjectRelativePath,
      }),
    },
  };
}

function withSnapshotRoots({ settings, comparison, layout }, operation) {
  const { repositoryRoot, projectRelativePath } = settings;
  return withTemporaryWorktree(repositoryRoot, comparison.mergeBaseSha, (baseWorktreeRoot) =>
    withNamedTemporaryWorktree(
      repositoryRoot,
      { commitSha: comparison.headSha, directoryName: 'head' },
      (headWorktreeRoot) =>
        operation({
          baseProjectRoot: path.join(baseWorktreeRoot, layout.baseProjectRelativePath),
          headSnapshotRoot: path.join(headWorktreeRoot, projectRelativePath),
        }),
    ),
  );
}

function compareSnapshots(context) {
  const { settings, layout, roots } = context;
  const baseSetup = {
    analyzers: settings.analyzers,
    headPolicy: settings.headPolicy,
    configOverrides: settings.configOverrides,
    policyChanges: [],
    policyLoosenings: [],
    ...settings.resolveBaseSetup?.({
      ...roots,
      moves: layout.moves,
      analyzers: settings.analyzers,
    }),
  };
  const setupContext = { ...context, baseSetup };
  return requiresPreparedDependencies(settings.analyzers)
    ? withPreparedAnalyzerDependencies(
        {
          baseProjectRoot: roots.baseProjectRoot,
          headSnapshotRoot: roots.headSnapshotRoot,
          liveProjectRoot: settings.headProjectRoot,
        },
        () => runWithPolicyFiles(setupContext),
      )
    : runWithPolicyFiles(setupContext);
}

function runWithPolicyFiles(context) {
  const { settings, baseSetup } = context;
  return withHeadPolicyFile(settings.headPolicy, (headPolicyFile) =>
    withBasePolicyFile(
      { basePolicy: baseSetup.headPolicy, headPolicy: settings.headPolicy, headPolicyFile },
      (basePolicyFile) => runAndCombine({ ...context, headPolicyFile, basePolicyFile }),
    ),
  );
}

function withBasePolicyFile({ basePolicy, headPolicy, headPolicyFile }, operation) {
  return JSON.stringify(basePolicy) === JSON.stringify(headPolicy)
    ? operation(headPolicyFile)
    : withHeadPolicyFile(basePolicy, operation);
}

function runAndCombine(context) {
  const { settings, comparison, layout, roots, startedAt, headPolicyFile } = context;
  const baseRun = runBaseSide(context);
  const headRun = withMovesFile(layout.moves.files, (baselineMovesFile) =>
    runAnalyzers({
      analyzers: settings.analyzers,
      projectRoot: roots.headSnapshotRoot,
      policyRoot: roots.headSnapshotRoot,
      toolRoot: PACKAGE_ROOT,
      liveProjectRoot: settings.headProjectRoot,
      headPolicyFile,
      snapshot: 'head',
      baselineRoot: roots.baseProjectRoot,
      baselineMovesFile,
      runTasks: settings.runTasks,
    }),
  );
  return combineAnalyzerReports({
    analyzers: settings.analyzers,
    baseRun,
    headRun,
    baseToHeadRenames: layout.moves.files,
    baseToHeadDirectories: layout.moves.directories,
    touchedCode: layout.touchedCode,
    comparison,
    startedAt,
    additionalToolErrors: settings.additionalToolErrors,
    configOverrides: settings.configOverrides,
    policyChanges: context.baseSetup.policyChanges,
    policyLoosenings: context.baseSetup.policyLoosenings,
    policyKinds: context.baseSetup.policyKinds,
    policyDigest: context.baseSetup.policyDigest,
    acceptPolicyChange: settings.acceptPolicyChange,
    policyAcceptanceSource: settings.policyAcceptanceSource,
    reportsPolicy: settings.reportsPolicy !== false,
    notices:
      settings.describeNotices?.([...layout.touchedCode.changedLines.keys()], {
        mergeBaseSha: comparison.mergeBaseSha,
        touchedPaths: [...layout.touchedPaths],
      }) ?? [],
  });
}

function runBaseAnalyzers(context, baseAnalyzers) {
  const { settings, roots, basePolicyFile } = context;
  return runAnalyzers({
    analyzers: baseAnalyzers,
    projectRoot: roots.baseProjectRoot,
    policyRoot: roots.headSnapshotRoot,
    toolRoot: PACKAGE_ROOT,
    liveProjectRoot: settings.headProjectRoot,
    headPolicyFile: basePolicyFile,
    snapshot: 'base',
    runTasks: settings.runTasks,
  });
}

function runBaseSide(context) {
  const { settings, comparison, layout, roots, baseSetup } = context;
  if (settings.cacheStore === undefined) {
    return runBaseAnalyzers(context, baseSetup.analyzers);
  }
  return runBaseWithCache({
    cache: createFindingsCache({
      store: settings.cacheStore,
      mergeBaseSha: comparison.mergeBaseSha,
      projectRelativePath: layout.baseProjectRelativePath,
      configOverrides: baseSetup.configOverrides,
      headPolicy: baseSetup.headPolicy,
    }),
    analyzers: baseSetup.analyzers,
    run: (baseAnalyzers) => runBaseAnalyzers(context, baseAnalyzers),
    onCached: (count, sources) =>
      settings.progress?.write(cachedLine({ label: 'base', count, sources })),
    resolveContext: {
      liveProjectRoot: settings.headProjectRoot,
      policyRoot: roots.headSnapshotRoot,
    },
  });
}

function requiresPreparedDependencies(analyzers) {
  return analyzers.some(
    (analyzer) =>
      typeof analyzer === 'object' && analyzer !== null && analyzer.requiresDependencies === true,
  );
}

function withPreparedAnalyzerDependencies(
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
