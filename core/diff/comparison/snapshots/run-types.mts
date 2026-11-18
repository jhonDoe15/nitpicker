import type { CacheStore } from '../../cache/cache-stores.mts';
import type { ProfiledAnalyzer } from '../../../../shared/values/analyzers.mts';

export type CaptureHead = (repositoryRoot: string, headSha: string) => unknown;

export type SharedWorktree = {
  readonly root: string;
  readonly commitSha: string;
  readonly lockPath: string;
};

export type RunSettings = {
  readonly repositoryRoot: string;
  readonly projectRelativePath: string;
  readonly headProjectRoot: string;
  readonly analyzers: readonly ProfiledAnalyzer[];
  readonly quick?: unknown;
  readonly cacheStore?: CacheStore | undefined;
  readonly configOverrides: unknown;
  readonly headPolicy: unknown;
  readonly progress?: { readonly write: (text: string) => unknown } | undefined;
  readonly scope?: unknown;
  readonly outputRoot: string;
  readonly runTasks?: unknown;
  readonly sharedBaseWorktree?: SharedWorktree | undefined;
};

export type SnapshotRoots = {
  readonly baseProjectRoot: string;
  readonly headSnapshotRoot: string;
  readonly sharedBase?: SharedWorktree | undefined;
};

export type SkipPlan = {
  readonly skipped: readonly string[];
  readonly affected: readonly unknown[];
};
