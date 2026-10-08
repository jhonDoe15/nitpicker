import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseAnalyzerReport } from './finding-schema.mjs';
import { resolveAnalyzerMetadata } from './run-analyzers.mjs';

const CACHE_SCHEMA = 1;

/**
 * Where findings are cached: `NITPICKER_CACHE_DIR` when set, else `node_modules/.cache/nitpicker`
 * of the project when it has a `node_modules` folder. Without either there is no cache.
 */
export function resolveCacheDirectory({ projectRoot, environment = process.env }) {
  const configured = environment.NITPICKER_CACHE_DIR;
  if (typeof configured === 'string' && configured.length > 0) {
    return path.resolve(projectRoot, configured);
  }
  return existsSync(path.join(projectRoot, 'node_modules'))
    ? path.join(projectRoot, 'node_modules/.cache/nitpicker')
    : undefined;
}

/** One cache key per analyzer: base commit, project, analyzer, tool version, head policy. */
export function cacheKey({ mergeBaseSha, projectRelativePath, analyzer, configOverrides = [] }) {
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
      ]),
    )
    .digest('hex');
}

export function createFindingsCache({
  directory,
  mergeBaseSha,
  projectRelativePath,
  configOverrides = [],
}) {
  const fileFor = (analyzer) =>
    path.join(
      directory,
      `${cacheKey({ mergeBaseSha, projectRelativePath, analyzer, configOverrides })}.json`,
    );
  return {
    /** Returns the cached report, or undefined on a miss or an unreadable entry. */
    read(analyzer) {
      try {
        const entry = JSON.parse(readFileSync(fileFor(analyzer), 'utf8'));
        return parseAnalyzerReport(entry, analyzer.name);
      } catch {
        return undefined;
      }
    },
    /** Best effort: a cache that cannot be written never fails the comparison. */
    write(analyzer, report) {
      try {
        mkdirSync(directory, { recursive: true });
        const target = fileFor(analyzer);
        const temporary = `${target}.${String(process.pid)}.tmp`;
        writeFileSync(temporary, `${JSON.stringify({ findings: report.findings })}\n`);
        renameSync(temporary, target);
      } catch {
        // Ignore: the next run just analyzes the base again.
      }
    },
  };
}

/**
 * Runs the base side through the cache. Cached analyzers are skipped unless an uncached analyzer
 * depends on them; only clean reports (no tool error, no tool-error finding) are stored.
 */
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
  while (pending.length > 0) {
    for (const dependency of byName.get(pending.pop())?.dependencies ?? []) {
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

function isCacheable(analyzer, report, toolErrors) {
  return (
    !toolErrors.some((error) => error.tool === analyzer.name) &&
    report.findings.every((finding) => finding.classification !== 'tool-error')
  );
}
