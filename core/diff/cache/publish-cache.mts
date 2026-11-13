import path from 'node:path';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import {
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from '../../../languages/typescript/adapters/static-checks/dependencies.mjs';
import { withHeadPolicyFile } from '../../../languages/typescript/preset/head-policy.mjs';
import { createFindingsCache, isCacheable } from './findings-cache.mjs';
import { runGit } from '../git/repository/command.mjs';
import { analyzerName } from '../reporting/report-model.mjs';
import { runAnalyzers } from '../execution/run-analyzers.mjs';
import { withTemporaryWorktree } from '../git/repository/worktree.mjs';
import type { Analyzer } from '../../../shared/values/analyzers.mts';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';

type PublishRequest = {
  readonly repositoryRoot: string;
  readonly projectRelativePath: string;
  readonly liveProjectRoot: string;
  readonly analyzers: readonly Analyzer[];
  readonly store: unknown;
  readonly configOverrides?: readonly unknown[];
  readonly headPolicy?: unknown;
  readonly runTasks: unknown;
  readonly warn: (message: string) => unknown;
};

export type PublishOutcome = {
  readonly commitSha: string;
  readonly published: readonly string[];
  readonly skipped: readonly string[];
};

type Publication = {
  readonly run: unknown;
  readonly cache: { write(analyzer: Analyzer, report: unknown): unknown };
  readonly published: string[];
  readonly skipped: string[];
};

export function publishBaseSnapshot({
  repositoryRoot,
  projectRelativePath,
  liveProjectRoot,
  analyzers,
  store,
  configOverrides = [],
  headPolicy = {},
  runTasks,
  warn,
}: PublishRequest): PublishOutcome {
  const commitSha = runGit(repositoryRoot, ['rev-parse', 'HEAD^{commit}']).trim();
  const cache = createFindingsCache({
    store,
    directory: undefined,
    mergeBaseSha: commitSha,
    projectRelativePath,
    configOverrides,
    headPolicy,
  });
  const published: string[] = [];
  const skipped: string[] = [];
  withTemporaryWorktree(repositoryRoot, { commitSha, warn }, (worktreeRoot: string) => {
    const projectRoot = path.join(worktreeRoot, projectRelativePath);
    const dependencies = snapshotDependencies(analyzers, { projectRoot, liveProjectRoot });
    try {
      const run = runBaseAnalyzers(
        { analyzers, liveProjectRoot, headPolicy, runTasks },
        projectRoot,
      );
      for (const [index, analyzer] of analyzers.entries()) {
        publishAnalyzer(analyzer, index, { run, cache, published, skipped });
      }
    } finally {
      removeSnapshotDependencies(dependencies);
    }
  });
  return { commitSha, published, skipped };
}

function runBaseAnalyzers(
  {
    analyzers,
    liveProjectRoot,
    headPolicy,
    runTasks,
  }: Pick<PublishRequest, 'analyzers' | 'liveProjectRoot' | 'runTasks'> & {
    readonly headPolicy: unknown;
  },
  projectRoot: string,
): unknown {
  return withHeadPolicyFile(headPolicy, (headPolicyFile: unknown) =>
    runAnalyzers({
      analyzers,
      projectRoot,
      policyRoot: projectRoot,
      toolRoot: PACKAGE_ROOT,
      liveProjectRoot,
      headPolicyFile,
      snapshot: 'base',
      baselineRoot: undefined,
      baselineMovesFile: undefined,
      mutationScope: undefined,
      logRoot: undefined,
      runTasks,
    }),
  );
}

function snapshotDependencies(
  analyzers: readonly Analyzer[],
  roots: { readonly projectRoot: string; readonly liveProjectRoot: string },
): unknown {
  return analyzers.some((analyzer) => analyzer['requiresDependencies'] === true)
    ? prepareSnapshotDependencies({ ...roots, toolRoot: PACKAGE_ROOT })
    : undefined;
}

function publishAnalyzer(
  analyzer: Analyzer,
  index: number,
  { run, cache, published, skipped }: Publication,
): void {
  const name = textOf(analyzerName(analyzer, index));
  const found = fieldOf(run, 'reports');
  const reports = found instanceof Map ? found : undefined;
  const report: unknown = reports?.get(name);
  if (
    report === undefined ||
    isCacheable(analyzer, report, { toolErrors: fieldOf(run, 'toolErrors'), reports }) !== true
  ) {
    skipped.push(`${name} (analysis failed)`);
    return;
  }
  if (cache.write(analyzer, report) === true) {
    published.push(name);
    return;
  }
  skipped.push(`${name} (upload failed)`);
}
