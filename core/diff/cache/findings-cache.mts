import { createHash } from 'node:crypto';
import path from 'node:path';
import { type CacheStore, createDirectoryStore, resolveCacheDirectory } from './cache-stores.mts';
import { cacheEntryText } from './entries/cache-entry.mts';
import { parseAnalyzerReport } from '../comparison/finding-schema.mjs';
import { type AnalyzerMetadata, metadataValue } from '../execution/report/analyzer-metadata.mts';
import type { TaskCheckpoint } from '../execution/tasks.mts';
import { nitpickerCodeFingerprint } from './code-fingerprint.mts';
import type { AnalyzerReport } from '../../../shared/values/findings.mts';
import { fieldOf } from '../../../shared/values/readers.mts';

export type FindingsCache = {
  readonly read: (analyzer: unknown, resolved?: AnalyzerMetadata) => AnalyzerReport | undefined;
  readonly write: (
    analyzer: unknown,
    report: AnalyzerReport,
    resolved?: AnalyzerMetadata,
  ) => boolean;
  readonly checkpointOf?: (
    analyzer: unknown,
    resolved?: AnalyzerMetadata,
  ) => TaskCheckpoint | undefined;
  readonly recover?: (analyzer: unknown, resolved?: AnalyzerMetadata) => AnalyzerReport | undefined;
};

type CacheKeyRequest = {
  readonly mergeBaseSha: string;
  readonly projectRelativePath: string;
  readonly analyzer: unknown;
  readonly resolved?: AnalyzerMetadata | undefined;
  readonly configOverrides?: unknown;
  readonly headPolicy?: unknown;
  readonly codeFingerprint?: string;
};

type CacheRequest = Omit<CacheKeyRequest, 'analyzer' | 'resolved'> & {
  readonly store: CacheStore | undefined;
  readonly directory: string | undefined;
};

type Attempt<T> =
  | { readonly kind: 'done'; readonly value: T }
  | { readonly kind: 'failed'; readonly error: unknown };

const reportOf: (value: unknown, analyzerName: unknown) => AnalyzerReport = parseAnalyzerReport;
const parseJson: (text: string) => unknown = JSON.parse;

const CACHE_SCHEMA = 1;

const UNAVAILABLE_STORE: CacheStore = { get: () => undefined, put: () => false };

export function cacheKey({
  mergeBaseSha,
  projectRelativePath,
  analyzer,
  resolved,
  configOverrides = [],
  headPolicy = {},
  codeFingerprint = nitpickerCodeFingerprint(),
}: CacheKeyRequest): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        CACHE_SCHEMA,
        codeFingerprint,
        mergeBaseSha,
        projectRelativePath,
        fieldOf(analyzer, 'name'),
        metadataValue(analyzer, 'version', resolved),
        metadataValue(analyzer, 'configurationHash', resolved),
        configOverrides,
        headPolicy,
        fieldOf(analyzer, 'legacyInventory'),
        ...(fieldOf(analyzer, 'quick') === true ? ['quick'] : []),
      ]),
    )
    .digest('hex');
}

export { resolveCacheDirectory };

function readReport(store: CacheStore, key: string, analyzer: unknown): AnalyzerReport | undefined {
  const text = store.get(key);
  const entry = text === undefined ? undefined : parseJson(text);
  if (text === undefined || fieldOf(entry, 'key') !== key) {
    return undefined;
  }
  const report = reportOf(entry, fieldOf(analyzer, 'name'));
  store.keep?.(key, text);
  return report;
}

export function createFindingsCache({
  store,
  directory,
  codeFingerprint = nitpickerCodeFingerprint(),
  ...keyed
}: CacheRequest): FindingsCache {
  const backend =
    store ?? (directory === undefined ? UNAVAILABLE_STORE : createDirectoryStore(directory));
  function keyFor(analyzer: unknown, resolved: AnalyzerMetadata | undefined): string {
    return cacheKey({
      ...keyed,
      analyzer,
      resolved,
      configOverrides: keyed.configOverrides ?? [],
      headPolicy: keyed.headPolicy ?? {},
      codeFingerprint,
    });
  }
  return {
    read(analyzer: unknown, resolved?: AnalyzerMetadata): AnalyzerReport | undefined {
      const outcome = attempt(() => readReport(backend, keyFor(analyzer, resolved), analyzer));
      return outcome.kind === 'done' ? outcome.value : undefined;
    },
    write(analyzer: unknown, report: AnalyzerReport, resolved?: AnalyzerMetadata): boolean {
      const outcome = attempt(() => {
        const key = keyFor(analyzer, resolved);
        return backend.put(key, cacheEntryText(key, report));
      });
      return outcome.kind === 'done' ? outcome.value : false;
    },
    ...checkpointsIn(store?.directory ?? directory, keyFor),
  };
}

function checkpointsIn(
  directory: string | undefined,
  keyFor: (analyzer: unknown, resolved: AnalyzerMetadata | undefined) => string,
): Pick<FindingsCache, 'checkpointOf' | 'recover'> {
  if (directory === undefined) {
    return {};
  }
  const local = createDirectoryStore(directory);
  return {
    checkpointOf(analyzer: unknown, resolved?: AnalyzerMetadata): TaskCheckpoint {
      const key = keyFor(analyzer, resolved);
      return { key, file: path.join(directory, `${key}.json`) };
    },
    recover(analyzer: unknown, resolved?: AnalyzerMetadata): AnalyzerReport | undefined {
      const outcome = attempt(() => readReport(local, keyFor(analyzer, resolved), analyzer));
      return outcome.kind === 'done' ? outcome.value : undefined;
    },
  };
}

function attempt<T>(action: () => T): Attempt<T> {
  try {
    return { kind: 'done', value: action() };
  } catch (error) {
    return { kind: 'failed', error };
  }
}
