import path from 'node:path';
import { PACKAGE_ROOT } from '../../adapters/tool-resolution.mjs';
import {
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from '../../adapters/diff/static-checks-runner.mjs';
import { withHeadPolicyFile } from '../../preset/head-policy.mjs';
import { createFindingsCache, isCacheable } from './findings-cache.mjs';
import { runGit } from './git.mjs';
import { analyzerName } from './report-model.mjs';
import { runAnalyzers } from './run-analyzers.mjs';
import { withTemporaryWorktree } from './worktree.mjs';

/**
 * Analyzes the committed tree at HEAD (typically the new tip of `main`) as a base snapshot and
 * stores each clean report under the key later comparisons use when HEAD is their merge base.
 * The policy is HEAD's own, so a branch whose policy differs simply misses.
 */
export function publishBaseSnapshot({
  repositoryRoot,
  projectRelativePath,
  liveProjectRoot,
  analyzers,
  store,
  configOverrides = [],
  headPolicy = {},
  runTasks,
}) {
  const commitSha = runGit(repositoryRoot, ['rev-parse', 'HEAD^{commit}']).trim();
  const cache = createFindingsCache({
    store,
    mergeBaseSha: commitSha,
    projectRelativePath,
    configOverrides,
    headPolicy,
  });
  const published = [];
  const skipped = [];
  withTemporaryWorktree(repositoryRoot, commitSha, (worktreeRoot) => {
    const projectRoot = path.join(worktreeRoot, projectRelativePath);
    const dependencies = analyzers.some((analyzer) => analyzer.requiresDependencies)
      ? prepareSnapshotDependencies({ projectRoot, liveProjectRoot, toolRoot: PACKAGE_ROOT })
      : undefined;
    try {
      const run = withHeadPolicyFile(headPolicy, (headPolicyFile) =>
        runAnalyzers({
          analyzers,
          projectRoot,
          policyRoot: projectRoot,
          toolRoot: PACKAGE_ROOT,
          liveProjectRoot,
          headPolicyFile,
          snapshot: 'base',
          runTasks,
        }),
      );
      for (const [index, analyzer] of analyzers.entries()) {
        const name = analyzerName(analyzer, index);
        const report = run.reports.get(name);
        if (report === undefined || !isCacheable(analyzer, report, run.toolErrors)) {
          skipped.push(`${name} (analysis failed)`);
        } else if (cache.write(analyzer, report)) {
          published.push(name);
        } else {
          skipped.push(`${name} (upload failed)`);
        }
      }
    } finally {
      removeSnapshotDependencies(dependencies);
    }
  });
  return { commitSha, published, skipped };
}
