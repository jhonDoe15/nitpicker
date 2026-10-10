import { createHash } from 'node:crypto';
import { createDirectoryStore, resolveCacheDirectory } from './cache-stores.mjs';
import { parseAnalyzerReport } from './finding-schema.mjs';
import { resolveAnalyzerMetadata } from './run-analyzers.mjs';

const CACHE_SCHEMA = 1;

/**
 * One cache key per analyzer: base commit, project, analyzer, tool version, configuration hash,
 * the head policy (exclude, layout, exceptions, thresholds) and the legacy inventory path. The
 * head policy is keyed explicitly because layout and threshold changes rebuild an analyzer
 * without changing its file-based configuration hash.
 */
export function cacheKey({
  mergeBaseSha,
  projectRelativePath,
  analyzer,
  configOverrides = [],
  headPolicy = {},
}) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        CACHE_SCHEMA,
        mergeBaseSha,
        projectRelativePath,
        analyzer.name,
        analyzer.version,
        analyzer.configurationHash,
        configOverrides,
        headPolicy,
        analyzer.legacyInventory,
      ]),
    )
    .digest('hex');
}

export { resolveCacheDirectory };

/**
 * The findings cache over a store (see `cache-stores.mjs`); `directory` is shorthand for a local
 * directory store. Entries carry their own key, so an entry stored under the wrong name is a miss.
 */
export function createFindingsCache({
  store,
  directory,
  mergeBaseSha,
  projectRelativePath,
  configOverrides = [],
  headPolicy = {},
}) {
  const backend = store ?? createDirectoryStore(directory);
  function keyFor(analyzer) {
    return cacheKey({ mergeBaseSha, projectRelativePath, analyzer, configOverrides, headPolicy });
  }
  return {
    /** Returns the cached report, or undefined on a miss, an unreadable or a mismatched entry. */
    read(analyzer) {
      try {
        const key = keyFor(analyzer);
        const text = backend.get(key);
        if (text === undefined) {
          return undefined;
        }
        const entry = JSON.parse(text);
        if (entry?.key !== key) {
          return undefined;
        }
        const report = parseAnalyzerReport(entry, analyzer.name);
        backend.keep?.(key, text);
        return report;
      } catch {
        return undefined;
      }
    },
    /** Best effort: a cache that cannot be written never fails the comparison. */
    write(analyzer, report) {
      try {
        const key = keyFor(analyzer);
        return backend.put(key, `${JSON.stringify({ key, findings: report.findings })}\n`);
      } catch {
        return false;
      }
    },
  };
}

/**
 * Runs the base side through the cache. Cached analyzers are skipped unless an uncached analyzer
 * depends on them; only clean reports (no tool error, no tool-error finding) are stored.
 */
export function runBaseWithCache({ cache, analyzers, run, resolveContext, onCached }) {
  const cached = readCachedReports(cache, analyzers, resolveContext);
  if (cached.size > 0) {
    onCached?.(cached.size);
  }

  const byName = new Map(analyzers.map((analyzer) => [analyzer.name, analyzer]));
  const toRun = new Set(analyzers.filter(({ name }) => !cached.has(name)).map(({ name }) => name));
  const pending = [...toRun];
  for (const name of pending) {
    for (const dependency of byName.get(name)?.dependencies ?? []) {
      if (!toRun.has(dependency) && byName.has(dependency)) {
        toRun.add(dependency);
        pending.push(dependency);
      }
    }
  }

  const result =
    toRun.size === 0
      ? { reports: new Map(), timings: new Map(), toolErrors: [] }
      : run(analyzers.filter(({ name }) => toRun.has(name)));
  for (const analyzer of analyzers) {
    const report = result.reports.get(analyzer.name);
    if (report === undefined) {
      const hit = cached.get(analyzer.name);
      if (hit !== undefined) {
        result.reports.set(analyzer.name, hit);
      }
    } else if (isCacheable(analyzer, report, result)) {
      cache.write(analyzer, report);
    }
  }
  return result;
}

function readCachedReports(cache, analyzers, resolveContext) {
  const cached = new Map();
  for (const analyzer of analyzers) {
    const lookup = lookUpCachedReport(cache, analyzer, resolveContext);
    if (lookup.kind === 'hit') {
      cached.set(analyzer.name, lookup.report);
    }
  }
  return cached;
}

function lookUpCachedReport(cache, analyzer, resolveContext) {
  try {
    resolveAnalyzerMetadata(analyzer, resolveContext);
  } catch (error) {
    return { kind: 'unresolved', error };
  }
  const report = cache.read(analyzer);
  return report === undefined ? { kind: 'miss' } : { kind: 'hit', report };
}

export function isCacheable(analyzer, report, { toolErrors, reports = new Map() }) {
  return (
    !toolErrors.some((error) => error.tool === analyzer.name) &&
    !hasToolErrorFinding(report) &&
    (analyzer.dependencies ?? []).every(
      (dependency) =>
        !toolErrors.some((error) => error.tool === dependency) &&
        !hasToolErrorFinding(reports.get(dependency)),
    )
  );
}

function hasToolErrorFinding(report) {
  return (report?.findings ?? []).some((finding) => finding.classification === 'tool-error');
}
