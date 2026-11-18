import path from 'node:path';
import { resolveCacheStore } from '../cache-stores.mts';
import { runBaseWithCache } from '../entries/run-with-cache.mts';
import { type ResumeCache, createResumeCache, finishResume } from './resume-cache.mts';
import { resumedLine } from '../../execution/progress.mts';
import {
  type AnalyzerRequest,
  type AnalyzerRun,
  runAnalyzers,
} from '../../execution/run-analyzers.mts';
import { runGit } from '../../git/repository/command.mjs';
import { fieldOf } from '../../../../shared/values/readers.mts';

export type SnapshotResume = ResumeCache & { readonly report: (line: string) => unknown };

type ResumeRequest = {
  readonly options: { readonly cache: boolean };
  readonly currentProjectRoot: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly repositoryRoot: string;
  readonly relativeProjectPath: string;
  readonly capturedSha: string;
  readonly headPolicy: unknown;
  readonly scope: unknown;
  readonly labels?: unknown;
  readonly analyzers: readonly unknown[];
  readonly stderr: { readonly write: (line: string) => unknown };
};

const gitOutput: (root: string, args: readonly string[]) => string = runGit;

function cacheStoreOf({ options, currentProjectRoot, environment }: ResumeRequest) {
  return options.cache
    ? resolveCacheStore({ projectRoot: currentProjectRoot, environment }).store
    : undefined;
}

export function snapshotResume(request: ResumeRequest): SnapshotResume | undefined {
  const treeSha = gitOutput(request.repositoryRoot, ['rev-parse', `${request.capturedSha}^{tree}`]);
  const resume = createResumeCache({
    cacheStore: cacheStoreOf(request),
    kind: 'snapshot',
    projectRelativePath: request.relativeProjectPath.split(path.sep).join('/') || '.',
    treeKey: `snapshot-tree:${treeSha.trim()}`,
    analyzers: request.analyzers,
    configOverrides: [{ mutationScope: fieldOf(request.scope, 'paths'), labels: request.labels }],
    headPolicy: request.headPolicy,
  });
  return resume === undefined
    ? undefined
    : { ...resume, report: (line: string) => request.stderr.write(line) };
}

export function finishSnapshotResume(resume: unknown, toolErrors: readonly unknown[]): void {
  finishResume(isResume(resume) ? resume.directory : undefined, toolErrors);
}

function isResume(value: unknown): value is SnapshotResume {
  return typeof fieldOf(value, 'directory') === 'string' && fieldOf(value, 'cache') !== undefined;
}

export function resumedAnalyzerRun(resume: unknown, request: AnalyzerRequest): AnalyzerRun {
  if (!isResume(resume)) {
    return runAnalyzers(request);
  }
  const result = runBaseWithCache({
    cache: resume.cache,
    analyzers: request.analyzers,
    run: (analyzers, checkpoints) => runAnalyzers({ ...request, analyzers, checkpoints }),
    onCached: (count) =>
      resume.report(resumedLine({ label: 'head', count, directory: resume.directory })),
    resolveContext: { liveProjectRoot: request.liveProjectRoot, policyRoot: request.policyRoot },
  });
  return {
    reports: result.reports,
    timings: new Map(
      [...result.timings].map(([name, elapsed]) => [
        name,
        typeof elapsed === 'number' ? elapsed : undefined,
      ]),
    ),
    toolErrors: [...result.toolErrors],
    skipped: 'skipped' in result ? result.skipped : new Map<string, unknown>(),
    metadata: result.metadata,
  };
}
