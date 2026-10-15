import path from 'node:path';
import { PACKAGE_ROOT } from '../tooling/tool-resolution.mjs';
import { compareFindings } from './compare.mjs';
import {
  captureWorkingTree,
  readChangedLines,
  readProjectMoves,
  readRepositoryChanges,
  resolveBaseProjectPath,
  resolveComparison,
} from './git.mjs';
import { analyzerName, policyHash, sortByToolAndPath } from './report-model.mjs';
import { writeDiffReports } from './reporters.mjs';
import {
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from '../../languages/typescript/adapters/static-checks-runner.mjs';
import { withHeadPolicyFile } from '../../languages/typescript/preset/head-policy.mjs';
import {
  isStrictRule,
  mustMeetOnEditedLines,
} from '../../languages/typescript/preset/strict-rules.mjs';
import { createFindingsCache, runBaseWithCache } from './findings-cache.mjs';
import { cachedLine } from './progress.mjs';
import { runAnalyzers } from './run-analyzers.mjs';
import { declaredExclusions, toolSummary } from './summary/tool-summary.mjs';
import { withNamedTemporaryWorktree, withTemporaryWorktree } from './worktree.mjs';

export function runQualityDiff(options) {
  const settings = withDefaults(options);
  const startedAt = Date.now();
  const comparison = resolveSnapshots(settings);
  const layout = readSnapshotLayout(settings, comparison);
  const report = withSnapshotRoots({ settings, comparison, layout }, (roots) =>
    compareSnapshots({ settings, comparison, layout, roots, startedAt }),
  );
  report.summary.elapsedMs = Date.now() - startedAt;
  report.text = writeDiffReports(settings.outputRoot, report);
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
  return {
    baseProjectRelativePath,
    moves,
    touchedCode: { changedLines, isStrictRule, mustMeetOnEditedLines },
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
    ...settings.resolveBaseSetup?.({
      baseProjectRoot: roots.baseProjectRoot,
      baseProjectRelativePath: layout.baseProjectRelativePath,
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
  const headRun = runAnalyzers({
    analyzers: settings.analyzers,
    projectRoot: roots.headSnapshotRoot,
    policyRoot: roots.headSnapshotRoot,
    toolRoot: PACKAGE_ROOT,
    liveProjectRoot: settings.headProjectRoot,
    headPolicyFile,
    snapshot: 'head',
    baselineRoot: roots.baseProjectRoot,
    runTasks: settings.runTasks,
  });
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
    onCached: (count) => settings.progress?.write(cachedLine({ label: 'base', count })),
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

function combineAnalyzerReports(context) {
  const { analyzers, baseRun, headRun, additionalToolErrors } = context;
  const toolErrors = [...additionalToolErrors, ...baseRun.toolErrors, ...headRun.toolErrors];
  const outcomes = analyzers.map((analyzer, index) =>
    compareAnalyzer({ ...context, analyzer, index, toolErrors }),
  );
  return buildReport({ ...context, outcomes, toolErrors });
}

function compareAnalyzer(context) {
  const { analyzer, index, baseRun, headRun, toolErrors } = context;
  const name = analyzerName(analyzer, index);
  const baseReport = baseRun.reports.get(name);
  const headReport = headRun.reports.get(name);
  const baseFindings = withoutEmittedToolErrors(baseReport?.findings ?? [], 'base', toolErrors);
  const headFindings = withoutEmittedToolErrors(headReport?.findings ?? [], 'head', toolErrors);
  const comparable =
    baseReport !== undefined &&
    headReport !== undefined &&
    !toolErrors.some((error) => error.tool === name);
  const result = comparable
    ? compareOrReportError({ ...context, name, baseFindings, headFindings })
    : emptyComparison();
  return {
    result,
    tool: toolSummary({ ...context, name, baseFindings, headFindings, result }),
  };
}

function compareOrReportError(context) {
  const { name, baseFindings, headFindings, toolErrors } = context;
  try {
    return compareFindings({
      baseFindings,
      headFindings,
      baseToHeadRenames: context.baseToHeadRenames,
      baseToHeadDirectories: context.baseToHeadDirectories,
      touchedCode: context.touchedCode,
    });
  } catch (error) {
    toolErrors.push({
      tool: name,
      snapshot: 'comparison',
      message: error instanceof Error ? error.message : String(error),
    });
    return emptyComparison();
  }
}

function collect(outcomes, key) {
  return outcomes.flatMap(({ result }) => result[key]);
}

function buildReport(context) {
  const { analyzers, outcomes, toolErrors, comparison, startedAt } = context;
  const { configOverrides, policyChanges } = context;
  const newFindings = collect(outcomes, 'newFindings');
  return {
    summary: {
      requestedBaseRef: comparison.requestedBaseRef,
      resolvedBaseSha: comparison.resolvedBaseSha,
      mergeBaseSha: comparison.mergeBaseSha,
      headSha: comparison.headSha,
      policyHash: policyHash(analyzers, configOverrides),
      configOverrides,
      policyChanges,
      tools: outcomes.map(({ tool }) => tool),
      exclusions: declaredExclusions(analyzers),
      renamedPaths: context.baseToHeadRenames.size,
      elapsedMs: Date.now() - startedAt,
      overallStatus: toolErrors.length === 0 ? 'completed' : 'tool-error',
      newEnforceableFindings: newFindings.filter(
        (finding) => finding.classification === 'enforceable',
      ).length,
    },
    newFindings: sortByToolAndPath(newFindings),
    resolvedFindings: sortByToolAndPath(collect(outcomes, 'resolvedFindings')),
    unchangedFindings: sortByToolAndPath(collect(outcomes, 'unchangedFindings')),
    changedMetrics: sortByToolAndPath(collect(outcomes, 'changedMetrics')),
    toolErrors: sortByToolAndPath(toolErrors),
  };
}

function withoutEmittedToolErrors(findings, snapshot, toolErrors) {
  return findings.filter((finding) => {
    if (finding.classification !== 'tool-error') {
      return true;
    }
    toolErrors.push({
      tool: finding.tool,
      snapshot,
      rule: finding.rule,
      path: finding.path,
      message: finding.message,
    });
    return false;
  });
}

function emptyComparison() {
  return {
    newFindings: [],
    resolvedFindings: [],
    unchangedFindings: [],
    changedMetrics: [],
  };
}
