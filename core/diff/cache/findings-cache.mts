import { createHash } from 'node:crypto';
import { type CacheStore, createDirectoryStore, resolveCacheDirectory } from './cache-stores.mts';
import { parseAnalyzerReport } from '../comparison/finding-schema.mjs';
import {
  type AnalyzerMetadata,
  type MetadataContext,
  type MetadataMap,
  mergeMetadata,
  partialMetadataOf,
  metadataValue,
  resolvedAnalyzerMetadata,
} from '../execution/report/analyzer-metadata.mts';
import { nitpickerCodeFingerprint } from './code-fingerprint.mts';
import type { AnalyzerReport, ReportEntry } from '../../../shared/values/findings.mts';
import { fieldOf, textsOf } from '../../../shared/values/readers.mts';
import { analyzerNameOf as nameOf } from '../../../shared/values/analyzers.mts';

export type FindingsCache = {
  readonly read: (
    analyzer: unknown,
    resolved: AnalyzerMetadata | undefined,
  ) => AnalyzerReport | undefined;
  readonly write: (
    analyzer: unknown,
    report: AnalyzerReport,
    resolved: AnalyzerMetadata | undefined,
  ) => boolean;
};

export type CachedRun = {
  readonly reports: Map<string, AnalyzerReport>;
  readonly timings: ReadonlyMap<string, unknown>;
  readonly toolErrors: readonly ReportEntry[];
  readonly metadata?: MetadataMap;
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

type Lookup = { readonly metadata?: AnalyzerMetadata } & (
  | { readonly kind: 'unresolved'; readonly error: unknown }
  | { readonly kind: 'miss' }
  | { readonly kind: 'hit'; readonly report: AnalyzerReport }
);

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

function cacheEntry(key: string, { findings, moduleImports }: AnalyzerReport): object {
  return moduleImports === undefined ? { key, findings } : { key, findings, moduleImports };
}

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
    read(analyzer: unknown, resolved: AnalyzerMetadata | undefined): AnalyzerReport | undefined {
      const outcome = attempt(() => readReport(backend, keyFor(analyzer, resolved), analyzer));
      return outcome.kind === 'done' ? outcome.value : undefined;
    },
    write(
      analyzer: unknown,
      report: AnalyzerReport,
      resolved: AnalyzerMetadata | undefined,
    ): boolean {
      const outcome = attempt(() => {
        const key = keyFor(analyzer, resolved);
        return backend.put(key, `${JSON.stringify(cacheEntry(key, report))}\n`);
      });
      return outcome.kind === 'done' ? outcome.value : false;
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

export function runBaseWithCache<T extends CachedRun>({
  cache,
  analyzers,
  run,
  resolveContext,
  onCached,
}: {
  readonly cache: FindingsCache;
  readonly analyzers: readonly unknown[];
  readonly run: (analyzers: readonly unknown[]) => T;
  readonly resolveContext: MetadataContext;
  readonly onCached?: (count: number) => unknown;
}): (T | CachedRun) & { readonly metadata: MetadataMap } {
  const { cached, metadata: lookedUp } = readCachedReports(cache, analyzers, resolveContext);
  if (cached.size > 0) {
    onCached?.(cached.size);
  }

  const toRun = uncachedDependencies(cached, analyzers);

  const ran: CachedRun =
    toRun.size === 0
      ? { reports: new Map(), timings: new Map(), toolErrors: [] }
      : run(analyzers.filter((analyzer) => toRun.has(nameOf(analyzer))));
  const result = { ...ran, metadata: mergeMetadata(lookedUp, ran.metadata) };
  for (const analyzer of analyzers) {
    applyCachedReport(analyzer, { result, cached, cache });
  }
  return result;
}

function readCachedReports(
  cache: FindingsCache,
  analyzers: readonly unknown[],
  resolveContext: MetadataContext,
): { readonly cached: Map<string, AnalyzerReport>; readonly metadata: MetadataMap } {
  const cached = new Map<string, AnalyzerReport>();
  const metadata = new Map<unknown, AnalyzerMetadata>();
  for (const analyzer of analyzers) {
    const lookup = lookUpCachedReport(cache, analyzer, resolveContext);
    const resolved =
      lookup.metadata ??
      (lookup.kind === 'unresolved' ? partialMetadataOf(lookup.error) : undefined);
    metadata.set(analyzer, { ...metadata.get(analyzer), ...resolved });
    if (lookup.kind === 'hit') {
      cached.set(nameOf(analyzer), lookup.report);
    }
  }
  return { cached, metadata };
}

function lookUpCachedReport(
  cache: FindingsCache,
  analyzer: unknown,
  resolveContext: MetadataContext,
): Lookup {
  try {
    const metadata = resolvedAnalyzerMetadata(analyzer, resolveContext);
    const report = cache.read(analyzer, metadata);
    return report === undefined ? { kind: 'miss', metadata } : { kind: 'hit', report, metadata };
  } catch (error) {
    return { kind: 'unresolved', error };
  }
}

export function isCacheable(
  analyzer: unknown,
  report: AnalyzerReport | undefined,
  {
    toolErrors,
    reports = new Map(),
  }: {
    readonly toolErrors: readonly ReportEntry[];
    readonly reports?: ReadonlyMap<string, AnalyzerReport>;
  },
): boolean {
  const failedTools = new Set(toolErrors.map((error) => error.tool));
  return (
    !(failedTools.has(nameOf(analyzer)) || hasToolErrorFinding(report)) &&
    textsOf(fieldOf(analyzer, 'dependencies')).every(
      (dependency) =>
        !(failedTools.has(dependency) || hasToolErrorFinding(reports.get(dependency))),
    )
  );
}

function hasToolErrorFinding(report: AnalyzerReport | undefined): boolean {
  return (report?.findings ?? []).some((finding) => finding.classification === 'tool-error');
}

function uncachedDependencies(
  cached: ReadonlyMap<string, AnalyzerReport>,
  analyzers: readonly unknown[],
): Set<string> {
  const byName = new Map(analyzers.map((analyzer) => [nameOf(analyzer), analyzer]));
  const toRun = new Set(analyzers.map(nameOf).filter((name) => !cached.has(name)));
  const pending = [...toRun];
  for (const name of pending) {
    const dependencies = textsOf(fieldOf(byName.get(name), 'dependencies')).filter(
      (dependency) => !toRun.has(dependency) && byName.has(dependency),
    );
    for (const dependency of dependencies) {
      toRun.add(dependency);
      pending.push(dependency);
    }
  }

  return toRun;
}

function applyCachedReport(
  analyzer: unknown,
  {
    result,
    cached,
    cache,
  }: {
    readonly result: CachedRun;
    readonly cached: ReadonlyMap<string, AnalyzerReport>;
    readonly cache: FindingsCache;
  },
): void {
  const name = nameOf(analyzer);
  const report = result.reports.get(name);
  if (report === undefined) {
    const hit = cached.get(name);
    if (hit !== undefined) {
      result.reports.set(name, hit);
    }
    return;
  }
  if (isCacheable(analyzer, report, result)) {
    cache.write(analyzer, report, result.metadata?.get(analyzer));
  }
}
