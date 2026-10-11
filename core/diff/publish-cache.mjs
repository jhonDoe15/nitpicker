import path from 'node:path';
import { PACKAGE_ROOT } from '../tooling/tool-resolution.mjs';
import {
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from '../../languages/typescript/adapters/static-checks-runner.mjs';
import { withHeadPolicyFile } from '../../languages/typescript/preset/head-policy.mjs';
import { createFindingsCache, isCacheable } from './findings-cache.mjs';
import { runGit } from './git.mjs';
import { analyzerName } from './report-model.mjs';
import { runAnalyzers } from './run-analyzers.mjs';
import { withTemporaryWorktree } from './worktree.mjs';

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
        if (report === undefined || !isCacheable(analyzer, report, run)) {
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
