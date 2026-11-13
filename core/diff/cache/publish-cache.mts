import path from 'node:path';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import {
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from '../../../languages/typescript/adapters/static-checks/dependencies.mjs';
import { withHeadPolicyFile } from '../../../languages/typescript/preset/head-policy.mjs';
import { type FindingsCache, createFindingsCache, isCacheable } from './findings-cache.mts';
import type { CacheStore } from './cache-stores.mts';
import { runGit } from '../git/repository/command.mjs';
import { analyzerName } from '../reporting/report-model.mts';
import { type AnalyzerRun, runAnalyzers } from '../execution/run-analyzers.mts';
import { withTemporaryWorktree } from '../git/repository/worktree.mjs';
import type { Analyzer } from '../../../shared/values/analyzers.mts';
import { textOf } from '../../../shared/values/readers.mts';

const withPolicyFile: <T>(policy: unknown, operation: (headPolicyFile: unknown) => T) => T =
  withHeadPolicyFile;

type PublishRequest = {
  readonly repositoryRoot: string;
  readonly projectRelativePath: string;
  readonly liveProjectRoot: string;
  readonly analyzers: readonly Analyzer[];
  readonly store: CacheStore | undefined;
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
  readonly run: AnalyzerRun;
  readonly cache: FindingsCache;
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
): AnalyzerRun {
  return withPolicyFile(headPolicy, (headPolicyFile: unknown) =>
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
  const { reports } = run;
  const report = reports.get(name);
  if (
    report === undefined ||
    !isCacheable(analyzer, report, { toolErrors: run.toolErrors, reports })
  ) {
    skipped.push(`${name} (analysis failed)`);
    return;
  }
  if (cache.write(analyzer, report)) {
    published.push(name);
    return;
  }
  skipped.push(`${name} (upload failed)`);
}
