import {
  isStrictRule,
  mustMeetOnEditedLines,
} from '../../../languages/typescript/preset/strict-rules.mjs';
import { writeDiffReports } from '../reporting/reporters.mjs';
import { partialRunField } from '../reporting/partial-run/partial-run.mjs';
import { runStamp } from '../reporting/run-stamp/run-stamp.mjs';
import path from 'node:path';
import { resolveComparison, captureWorkingTree, hasSameTree } from '../git/repository/git.mjs';
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
import { analyzerRunOptions, runAnalyzers } from '../execution/run-analyzers.mjs';
import { withMovesFile } from '../git/patches/moves-file.mjs';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import { combineAnalyzerReports, noChangesReport, allSkippedReport } from './results.mjs';
import { runBaseWithCache, createFindingsCache } from '../cache/findings-cache.mjs';
import { cachedLine } from '../execution/progress.mjs';
import { quickScoped, runHeadAnalyzers } from './quick/head-run.mjs';
import { withComparisonKeys } from '../cache/keys/comparison-keys.mjs';
import {
  requiresPreparedDependencies,
  withPreparedAnalyzerDependencies,
} from './dependencies/prepared-dependencies.mjs';
import { carryBaseReports, endsEarly, skipPlanOf, runUnlessSkipped } from '../skipping/apply.mjs';

export function runQualityDiff(options) {
  const settings = withDefaults(options);
  const startedAt = Date.now();
  const stamp = runStamp({ ...settings, projectRoot: settings.headProjectRoot });
  const comparison = resolveSnapshots(settings);
  const report = hasSameTree(settings.repositoryRoot, comparison.mergeBaseSha, comparison.headSha)
    ? noChangesReport({ ...settings, comparison, startedAt })
    : compareChanges(settings, comparison, startedAt);
  report.summary.elapsedMs = Date.now() - startedAt;
  Object.assign(report.summary, stamp, partialRunField(settings.partialRun));
  report.text = writeDiffReports(settings.outputRoot, report, {
    projectPath: settings.projectRelativePath,
    repositoryRoot: settings.repositoryRoot,
  });
  return report;
}

function compareChanges(settings, comparison, startedAt) {
  const layout = readSnapshotLayout(settings, comparison);
  return withSnapshotRoots({ settings, comparison, layout }, (roots) =>
    compareSnapshots({ settings, comparison, layout, roots, startedAt }),
  );
}

function withDefaults(options) {
  const given = Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  );
  return {
    headProjectRoot: path.join(options.repositoryRoot, options.projectRelativePath),
    includeWorkingTree: false,
    captureHead: captureWorkingTree,
    additionalToolErrors: [],
    configOverrides: [],
    headPolicy: {},
    ...given,
  };
}

function resolveSnapshots({ repositoryRoot, requestedBaseRef, includeWorkingTree, captureHead }) {
  const committed = resolveComparison(repositoryRoot, requestedBaseRef);
  return includeWorkingTree
    ? { ...committed, headSha: captureHead(repositoryRoot, committed.headSha) }
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
  return {
    baseProjectRelativePath,
    moves,
    touchedPaths: readTouchedPaths({ projectRelativePath, baseProjectRelativePath, changes }),
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
  const { repositoryRoot, projectRelativePath, warn } = settings;
  const base = { commitSha: comparison.mergeBaseSha, warn };
  return withTemporaryWorktree(repositoryRoot, base, (baseWorktreeRoot) =>
    withNamedTemporaryWorktree(
      repositoryRoot,
      { commitSha: comparison.headSha, directoryName: 'head', warn },
      (headWorktreeRoot) =>
        operation({
          baseProjectRoot: path.join(baseWorktreeRoot, layout.baseProjectRelativePath),
          headSnapshotRoot: path.join(headWorktreeRoot, projectRelativePath),
        }),
    ),
  );
}

function compareSnapshots(context) {
  const { settings, layout, roots, comparison, startedAt } = context;
  const skipPlan = skipPlanOf(settings, comparison);
  const baseSetup = {
    analyzers: settings.analyzers,
    headPolicy: settings.headPolicy,
    configOverrides: settings.configOverrides,
    policyChanges: [],
    policyLoosenings: [],
    ...settings.resolveBaseSetup?.({
      ...roots,
      liveProjectRoot: settings.headProjectRoot,
      moves: layout.moves,
      analyzers: settings.analyzers,
    }),
  };
  if (endsEarly(skipPlan, baseSetup)) {
    return allSkippedReport({
      ...settings,
      comparison,
      startedAt,
      skippedAnalyzers: skipPlan.skipped,
    });
  }
  const setupContext = { ...context, baseSetup, skipPlan };
  return requiresPreparedDependencies(
    settings.analyzers.filter(({ name }) => skipPlan.affected.includes(name)),
  )
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
  const { settings, comparison, layout, startedAt } = context;
  const baseRun = runBaseSide(context);
  const ranHead = withMovesFile(layout.moves.files, (baselineMovesFile) =>
    runHeadAnalyzers(context, baselineMovesFile),
  );
  const { analyzers, headRun } = carryBaseReports({
    analyzers: settings.analyzers,
    baseRun,
    headRun: ranHead,
    skipPlan: context.skipPlan,
  });
  return combineAnalyzerReports({
    analyzers,
    policyAnalyzers: settings.analyzers,
    skippedAnalyzers: context.skipPlan.skipped,
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
    policies: { base: context.baseSetup.headPolicy, head: settings.headPolicy },
    acceptPolicyChange: settings.acceptPolicyChange,
    scope: settings.scope,
    policyAcceptanceSource: settings.policyAcceptanceSource,
    reportsPolicy: settings.reportsPolicy !== false,
    quick: settings.quick,
    staged: settings.staged,
    notices:
      settings.describeNotices?.([...layout.touchedCode.changedLines.keys()], {
        mergeBaseSha: comparison.mergeBaseSha,
        touchedPaths: [...layout.touchedPaths],
      }) ?? [],
  });
}

function runBaseAnalyzers(context, baseAnalyzers) {
  const { settings, roots, basePolicyFile } = context;
  return runUnlessSkipped(baseAnalyzers, context.skipPlan, (analyzersToRun) =>
    runAnalyzers({
      analyzers: analyzersToRun,
      projectRoot: roots.baseProjectRoot,
      policyRoot: roots.headSnapshotRoot,
      toolRoot: PACKAGE_ROOT,
      liveProjectRoot: settings.headProjectRoot,
      headPolicyFile: basePolicyFile,
      snapshot: 'base',
      ...analyzerRunOptions(settings),
    }),
  );
}

function runBaseSide(context) {
  const { settings, comparison, layout, roots, baseSetup } = context;
  if (settings.cacheStore === undefined) {
    return runBaseAnalyzers(context, quickScoped(settings, layout, baseSetup.analyzers));
  }
  return runBaseWithCache({
    cache: createFindingsCache({
      store: settings.cacheStore,
      mergeBaseSha: comparison.mergeBaseSha,
      projectRelativePath: layout.baseProjectRelativePath,
      configOverrides: baseSetup.configOverrides,
      headPolicy: baseSetup.headPolicy,
    }),
    analyzers: withComparisonKeys(quickScoped(settings, layout, baseSetup.analyzers), {
      touchedPaths: [...layout.touchedPaths],
      headRoot: roots.headSnapshotRoot,
      mergeBaseSha: comparison.mergeBaseSha,
      quick: settings.quick !== undefined,
    }),
    run: (baseAnalyzers) => runBaseAnalyzers(context, baseAnalyzers),
    onCached: (count) =>
      settings.progress?.write(
        cachedLine({ label: 'base', count, directory: settings.cacheStore.directory }),
      ),
    resolveContext: {
      liveProjectRoot: settings.headProjectRoot,
      policyRoot: roots.headSnapshotRoot,
    },
  });
}
