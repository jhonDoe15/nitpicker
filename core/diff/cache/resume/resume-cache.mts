import { createHash } from 'node:crypto';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { type CacheStore, createDirectoryStore } from '../cache-stores.mts';
import { type FindingsCache, createFindingsCache } from '../findings-cache.mts';
import { SCHEDULER_TOOL } from '../../execution/run-analyzers.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';

type ResumeKind = 'head' | 'snapshot';

const FOLDER_NAME_LENGTH = 16;

export type ResumeCache = { readonly cache: FindingsCache; readonly directory: string };

export type ResumePlace = {
  readonly cacheStore: CacheStore | undefined;
  readonly kind: ResumeKind;
  readonly projectRelativePath: string;
  readonly treeKey: string;
  readonly analyzers: readonly unknown[];
};

type ResumeRequest = ResumePlace & {
  readonly configOverrides: unknown;
  readonly headPolicy: unknown;
};

export function resumeDirectory({
  cacheStore,
  kind,
  projectRelativePath,
  treeKey,
  analyzers,
}: ResumePlace): string | undefined {
  const cacheDirectory = cacheStore?.directory;
  if (cacheDirectory === undefined) {
    return undefined;
  }
  const names = analyzers.map((analyzer) => textOf(fieldOf(analyzer, 'name'))).toSorted();
  const digest = createHash('sha256')
    .update(JSON.stringify([kind, projectRelativePath, treeKey, names]))
    .digest('hex');
  return path.join(cacheDirectory, 'resume', digest.slice(0, FOLDER_NAME_LENGTH));
}

export function createResumeCache(request: ResumeRequest): ResumeCache | undefined {
  const directory = resumeDirectory(request);
  if (directory === undefined) {
    return undefined;
  }
  const store = { ...createDirectoryStore(directory), directory };
  const cache = createFindingsCache({
    store,
    directory: undefined,
    mergeBaseSha: request.treeKey,
    projectRelativePath: request.projectRelativePath,
    configOverrides: request.configOverrides,
    headPolicy: request.headPolicy,
  });
  return { cache, directory };
}

export function finishResume(
  directory: string | undefined,
  toolErrors: readonly unknown[],
): { readonly removed: boolean; readonly error?: unknown } {
  const unfinished = toolErrors.some((error) => fieldOf(error, 'tool') === SCHEDULER_TOOL);
  if (directory === undefined || unfinished) {
    return { removed: false };
  }
  try {
    rmSync(directory, { recursive: true, force: true });
    return { removed: true };
  } catch (error) {
    return { removed: false, error };
  }
}
