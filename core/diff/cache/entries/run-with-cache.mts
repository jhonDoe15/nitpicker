import type { FindingsCache } from '../findings-cache.mts';
import {
  type AnalyzerMetadata,
  type MetadataContext,
  type MetadataMap,
  mergeMetadata,
  partialMetadataOf,
  resolvedAnalyzerMetadata,
} from '../../execution/report/analyzer-metadata.mts';
import type { Checkpoints, TaskCheckpoint } from '../../execution/tasks.mts';
import type { AnalyzerReport, ReportEntry } from '../../../../shared/values/findings.mts';
import { fieldOf, textsOf } from '../../../../shared/values/readers.mts';
import { analyzerNameOf as nameOf } from '../../../../shared/values/analyzers.mts';

export type CachedRun = {
  readonly reports: Map<string, AnalyzerReport>;
  readonly timings: ReadonlyMap<string, unknown>;
  readonly toolErrors: readonly ReportEntry[];
  readonly metadata?: MetadataMap;
};

type Lookup = { readonly metadata?: AnalyzerMetadata } & (
  | { readonly kind: 'unresolved'; readonly error: unknown }
  | { readonly kind: 'miss' }
  | { readonly kind: 'hit'; readonly report: AnalyzerReport }
);

export function runBaseWithCache<T extends CachedRun>({
  cache,
  analyzers,
  run,
  resolveContext,
  onCached,
}: {
  readonly cache: FindingsCache;
  readonly analyzers: readonly unknown[];
  readonly run: (analyzers: readonly unknown[], checkpoints: Checkpoints) => T;
  readonly resolveContext: MetadataContext;
  readonly onCached?: (count: number) => unknown;
}): (T | CachedRun) & { readonly metadata: MetadataMap } {
  const { cached, metadata: lookedUp } = readCachedReports(cache, analyzers, resolveContext);
  if (cached.size > 0) {
    onCached?.(cached.size);
  }

  const toRun = uncachedDependencies(cached, analyzers);

  const running = analyzers.filter((analyzer) => toRun.has(nameOf(analyzer)));
  const ran: CachedRun =
    running.length === 0
      ? { reports: new Map(), timings: new Map(), toolErrors: [] }
      : run(running, checkpointsOf(cache, running, lookedUp));
  const result = { ...ran, metadata: mergeMetadata(lookedUp, ran.metadata) };
  recoverCheckpoints(cache, running, { reports: result.reports, metadata: lookedUp });
  for (const analyzer of analyzers) {
    applyCachedReport(analyzer, { result, cached, cache });
  }
  return result;
}

function checkpointsOf(
  cache: FindingsCache,
  analyzers: readonly unknown[],
  metadata: MetadataMap,
): Checkpoints {
  const checkpoints = new Map<string, TaskCheckpoint>();
  for (const analyzer of analyzers) {
    const checkpoint = cache.checkpointOf?.(analyzer, metadata.get(analyzer));
    if (checkpoint !== undefined) {
      checkpoints.set(nameOf(analyzer), checkpoint);
    }
  }
  return checkpoints;
}

function recoverCheckpoints(
  cache: FindingsCache,
  analyzers: readonly unknown[],
  { reports, metadata }: { readonly reports: Map<string, AnalyzerReport>; metadata: MetadataMap },
): void {
  for (const analyzer of analyzers) {
    const name = nameOf(analyzer);
    const recovered = reports.has(name)
      ? undefined
      : cache.recover?.(analyzer, metadata.get(analyzer));
    if (recovered !== undefined) {
      reports.set(name, recovered);
    }
  }
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
