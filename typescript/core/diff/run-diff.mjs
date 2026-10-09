import path from 'node:path';
import { PACKAGE_ROOT } from '../../adapters/tool-resolution.mjs';
import { compareFindings } from './compare.mjs';
import { captureWorkingTree, readChangedLines, readRenameMap, resolveComparison } from './git.mjs';
import { analyzerMetadata, analyzerName, policyHash, sortByToolAndPath } from './report-model.mjs';
import { writeDiffReports } from './reporters.mjs';
import {
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from '../../adapters/diff/static-checks-runner.mjs';
import { withHeadPolicyFile } from '../../preset/head-policy.mjs';
import { isStrictRule } from '../../preset/strict-rules.mjs';
import { createFindingsCache, runBaseWithCache } from './findings-cache.mjs';
import { runAnalyzers } from './run-analyzers.mjs';
import { withTemporaryWorktree } from './worktree.mjs';

export function runQualityDiff({
  repositoryRoot,
  projectRelativePath,
  headProjectRoot = path.join(repositoryRoot, projectRelativePath),
  requestedBaseRef,
  outputRoot,
  analyzers,
  includeWorkingTree = false,
  additionalToolErrors = [],
  configOverrides = [],
  headPolicy = {},
  cacheStore,
  runTasks,
}) {
  const startedAt = Date.now();
  const committedComparison = resolveComparison(repositoryRoot, requestedBaseRef);
  const comparison = includeWorkingTree
    ? {
        ...committedComparison,
        headSha: captureWorkingTree(repositoryRoot, committedComparison.headSha),
      }
    : committedComparison;
  const baseToHeadRenames = readRenameMap({
    repositoryRoot,
    mergeBaseSha: comparison.mergeBaseSha,
    headSha: comparison.headSha,
    projectRelativePath,
  });
  const touchedCode = {
    changedLines: readChangedLines({
      repositoryRoot,
      mergeBaseSha: comparison.mergeBaseSha,
      headSha: comparison.headSha,
      projectRelativePath,
    }),
    isStrictRule,
  };

  const report = withTemporaryWorktree(
    repositoryRoot,
    comparison.mergeBaseSha,
    (baseWorktreeRoot) =>
      withTemporaryWorktree(repositoryRoot, comparison.headSha, (headWorktreeRoot) => {
        const baseProjectRoot = path.join(baseWorktreeRoot, projectRelativePath);
        const headSnapshotRoot = path.join(headWorktreeRoot, projectRelativePath);
        const compareSnapshots = () =>
          withHeadPolicyFile(headPolicy, (headPolicyFile) => {
            const runBase = (baseAnalyzers) =>
              runAnalyzers({
                analyzers: baseAnalyzers,
                projectRoot: baseProjectRoot,
                policyRoot: headSnapshotRoot,
                toolRoot: PACKAGE_ROOT,
                liveProjectRoot: headProjectRoot,
                headPolicyFile,
                snapshot: 'base',
                runTasks,
              });
            // Only the base side is cached: it is a committed tree, so it cannot change under the key.
            const baseRun =
              cacheStore === undefined
                ? runBase(analyzers)
                : runBaseWithCache({
                    cache: createFindingsCache({
                      store: cacheStore,
                      mergeBaseSha: comparison.mergeBaseSha,
                      projectRelativePath,
                      configOverrides,
                      headPolicy,
                    }),
                    analyzers,
                    run: runBase,
                    resolveContext: {
                      liveProjectRoot: headProjectRoot,
                      policyRoot: headSnapshotRoot,
                    },
                  });
            const headRun = runAnalyzers({
              analyzers,
              projectRoot: headSnapshotRoot,
              policyRoot: headSnapshotRoot,
              toolRoot: PACKAGE_ROOT,
              liveProjectRoot: headProjectRoot,
              headPolicyFile,
              snapshot: 'head',
              baselineRoot: baseProjectRoot,
              runTasks,
            });
            return combineAnalyzerReports({
              analyzers,
              baseRun,
              headRun,
              baseToHeadRenames,
              touchedCode,
              comparison,
              startedAt,
              additionalToolErrors,
              configOverrides,
            });
          });
        return requiresPreparedDependencies(analyzers)
          ? withPreparedAnalyzerDependencies(
              {
                baseProjectRoot,
                headSnapshotRoot,
                liveProjectRoot: headProjectRoot,
              },
              compareSnapshots,
            )
          : compareSnapshots();
      }),
  );
  report.summary.elapsedMs = Date.now() - startedAt;
  report.text = writeDiffReports(outputRoot, report);
  return report;
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

function combineAnalyzerReports({
  analyzers,
  baseRun,
  headRun,
  baseToHeadRenames,
  touchedCode,
  comparison,
  startedAt,
  additionalToolErrors,
  configOverrides,
}) {
  const newFindings = [];
  const resolvedFindings = [];
  const unchangedFindings = [];
  const changedMetrics = [];
  const toolErrors = [...additionalToolErrors, ...baseRun.toolErrors, ...headRun.toolErrors];
  const tools = [];

  for (const [index, analyzer] of analyzers.entries()) {
    const name = analyzerName(analyzer, index);
    const baseReport = baseRun.reports.get(name);
    const headReport = headRun.reports.get(name);
    const baseElapsedMs = baseRun.timings.get(name) ?? null;
    const headElapsedMs = headRun.timings.get(name) ?? null;
    const baseFindings = withoutEmittedToolErrors(baseReport?.findings ?? [], 'base', toolErrors);
    const headFindings = withoutEmittedToolErrors(headReport?.findings ?? [], 'head', toolErrors);
    let result = emptyComparison();

    if (
      baseReport !== undefined &&
      headReport !== undefined &&
      !toolErrors.some((error) => error.tool === name)
    ) {
      try {
        result = compareFindings({
          baseFindings,
          headFindings,
          baseToHeadRenames,
          touchedCode,
        });
        newFindings.push(...result.newFindings);
        resolvedFindings.push(...result.resolvedFindings);
        unchangedFindings.push(...result.unchangedFindings);
        changedMetrics.push(...result.changedMetrics);
      } catch (error) {
        toolErrors.push({
          tool: name,
          snapshot: 'comparison',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    tools.push({
      name,
      version: analyzerMetadata(analyzer, 'version'),
      configurationHash: analyzerMetadata(analyzer, 'configurationHash'),
      base: baseFindings.length,
      head: headFindings.length,
      new: result.newFindings.length,
      resolved: result.resolvedFindings.length,
      unchanged: result.unchangedFindings.length,
      changedMetrics: result.changedMetrics.length,
      baseElapsedMs,
      headElapsedMs,
      elapsedMs: (baseElapsedMs ?? 0) + (headElapsedMs ?? 0),
    });
  }

  const exclusions = [
    ...new Set(
      analyzers.flatMap((analyzer) =>
        typeof analyzer === 'object' && analyzer !== null && Array.isArray(analyzer.exclusions)
          ? analyzer.exclusions.filter((exclusion) => typeof exclusion === 'string')
          : [],
      ),
    ),
  ].sort();
  const newEnforceableFindings = newFindings.filter(
    (finding) => finding.classification === 'enforceable',
  ).length;
  const overallStatus = toolErrors.length === 0 ? 'completed' : 'tool-error';
  return {
    summary: {
      requestedBaseRef: comparison.requestedBaseRef,
      resolvedBaseSha: comparison.resolvedBaseSha,
      mergeBaseSha: comparison.mergeBaseSha,
      headSha: comparison.headSha,
      policyHash: policyHash(analyzers, configOverrides),
      configOverrides,
      tools,
      exclusions,
      renamedPaths: baseToHeadRenames.size,
      elapsedMs: Date.now() - startedAt,
      overallStatus,
      newEnforceableFindings,
    },
    newFindings: sortByToolAndPath(newFindings),
    resolvedFindings: sortByToolAndPath(resolvedFindings),
    unchangedFindings: sortByToolAndPath(unchangedFindings),
    changedMetrics: sortByToolAndPath(changedMetrics),
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
