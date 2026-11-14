import { createHash } from 'node:crypto';
import { type CacheStore, createDirectoryStore, resolveCacheDirectory } from './cache-stores.mts';
import { parseAnalyzerReport } from '../comparison/finding-schema.mjs';
import {
  type MetadataContext,
  resolveAnalyzerMetadata,
} from '../execution/report/analyzer-metadata.mts';
import { nitpickerCodeFingerprint } from './code-fingerprint.mts';
import type { AnalyzerReport, ReportEntry } from '../../../shared/values/findings.mts';
import { fieldOf, textsOf } from '../../../shared/values/readers.mts';
import { analyzerNameOf as nameOf } from '../../../shared/values/analyzers.mts';

export type FindingsCache = {
  readonly read: (analyzer: unknown) => AnalyzerReport | undefined;
  readonly write: (analyzer: unknown, report: AnalyzerReport) => boolean;
};

export type CachedRun = {
  readonly reports: Map<string, AnalyzerReport>;
  readonly timings: ReadonlyMap<string, unknown>;
  readonly toolErrors: readonly ReportEntry[];
};

type CacheKeyRequest = {
  readonly mergeBaseSha: string;
  readonly projectRelativePath: string;
  readonly analyzer: unknown;
  readonly configOverrides?: unknown;
  readonly headPolicy?: unknown;
  readonly codeFingerprint?: string;
};

type CacheRequest = Omit<CacheKeyRequest, 'analyzer'> & {
  readonly store: CacheStore | undefined;
  readonly directory: string | undefined;
};

type Lookup =
  | { readonly kind: 'unresolved'; readonly error: unknown }
  | { readonly kind: 'miss' }
  | { readonly kind: 'hit'; readonly report: AnalyzerReport };

type Attempt<T> =
  | { readonly kind: 'done'; readonly value: T }
  | { readonly kind: 'failed'; readonly error: unknown };

const reportOf: (value: unknown, analyzerName: unknown) => AnalyzerReport = parseAnalyzerReport;
const parseJson: (text: string) => unknown = JSON.parse;

const CACHE_SCHEMA = 1;

const UNAVAILABLE_STORE: CacheStore = {
  get(): undefined {
    return undefined;
  },
  put(): boolean {
    return false;
  },
};

export function cacheKey({
  mergeBaseSha,
  projectRelativePath,
  analyzer,
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
        fieldOf(analyzer, 'version'),
        fieldOf(analyzer, 'configurationHash'),
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

export function createFindingsCache({
  store,
  directory,
  mergeBaseSha,
  projectRelativePath,
  configOverrides,
  headPolicy,
  codeFingerprint = nitpickerCodeFingerprint(),
}: CacheRequest): FindingsCache {
  const backend =
    store ?? (directory === undefined ? UNAVAILABLE_STORE : createDirectoryStore(directory));
  function keyFor(analyzer: unknown): string {
    return cacheKey({
      mergeBaseSha,
      projectRelativePath,
      analyzer,
      configOverrides: configOverrides ?? [],
      headPolicy: headPolicy ?? {},
      codeFingerprint,
    });
  }
  function readReport(analyzer: unknown): AnalyzerReport | undefined {
    const key = keyFor(analyzer);
    const text = backend.get(key);
    if (text === undefined) {
      return undefined;
    }
    const entry = parseJson(text);
    if (fieldOf(entry, 'key') !== key) {
      return undefined;
    }
    const report = reportOf(entry, fieldOf(analyzer, 'name'));
    backend.keep?.(key, text);
    return report;
  }
  function writeReport(analyzer: unknown, report: AnalyzerReport): boolean {
    const key = keyFor(analyzer);
    return backend.put(key, `${JSON.stringify(cacheEntry(key, report))}\n`);
  }
  return {
    read(analyzer: unknown): AnalyzerReport | undefined {
      const outcome = attempt(() => readReport(analyzer));
      return outcome.kind === 'done' ? outcome.value : undefined;
    },
    write(analyzer: unknown, report: AnalyzerReport): boolean {
      const outcome = attempt(() => writeReport(analyzer, report));
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
}): T | CachedRun {
  const cached = readCachedReports(cache, analyzers, resolveContext);
  if (cached.size > 0) {
    onCached?.(cached.size);
  }

  const toRun = uncachedDependencies(cached, analyzers);

  const result =
    toRun.size === 0
      ? { reports: new Map(), timings: new Map(), toolErrors: [] }
      : run(analyzers.filter((analyzer) => toRun.has(nameOf(analyzer))));
  for (const analyzer of analyzers) {
    applyCachedReport(analyzer, { result, cached, cache });
  }
  return result;
}

function readCachedReports(
  cache: FindingsCache,
  analyzers: readonly unknown[],
  resolveContext: MetadataContext,
): Map<string, AnalyzerReport> {
  const cached = new Map<string, AnalyzerReport>();
  for (const analyzer of analyzers) {
    const lookup = lookUpCachedReport(cache, analyzer, resolveContext);
    if (lookup.kind === 'hit') {
      cached.set(nameOf(analyzer), lookup.report);
    }
  }
  return cached;
}

function lookUpCachedReport(
  cache: FindingsCache,
  analyzer: unknown,
  resolveContext: MetadataContext,
): Lookup {
  try {
    resolveAnalyzerMetadata(analyzer, resolveContext);
  } catch (error) {
    return { kind: 'unresolved', error };
  }
  const report = cache.read(analyzer);
  return report === undefined ? { kind: 'miss' } : { kind: 'hit', report };
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
    cache.write(analyzer, report);
  }
}
