import { createHash } from 'node:crypto';
import { createDirectoryStore, resolveCacheDirectory } from './cache-stores.mjs';
import { parseAnalyzerReport } from './finding-schema.mjs';
import { resolveAnalyzerMetadata } from './run-analyzers.mjs';

const CACHE_SCHEMA = 1;

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

export function runBaseWithCache({ cache, analyzers, run, resolveContext }) {
  const cached = new Map();
  for (const analyzer of analyzers) {
    try {
      resolveAnalyzerMetadata(analyzer, resolveContext);
    } catch {
      continue;
    }
    const report = cache.read(analyzer);
    if (report !== undefined) {
      cached.set(analyzer.name, report);
    }
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
    } else if (isCacheable(analyzer, report, result.toolErrors)) {
      cache.write(analyzer, report);
    }
  }
  return result;
}

export function isCacheable(analyzer, report, toolErrors) {
  return (
    !toolErrors.some((error) => error.tool === analyzer.name) &&
    report.findings.every((finding) => finding.classification !== 'tool-error')
  );
}
