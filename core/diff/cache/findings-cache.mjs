import { createHash } from 'node:crypto';
import { createDirectoryStore, resolveCacheDirectory } from './cache-stores.mjs';
import { parseAnalyzerReport } from '../comparison/finding-schema.mjs';
import { resolveAnalyzerMetadata } from '../execution/run-analyzers.mjs';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import { computeCodeFingerprint } from './code-fingerprint.mjs';

const CACHE_SCHEMA = 1;

export function cacheKey({
  mergeBaseSha,
  projectRelativePath,
  analyzer,
  configOverrides = [],
  headPolicy = {},
  codeFingerprint,
}) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        CACHE_SCHEMA,
        codeFingerprint,
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

function readReport(backend, key, analyzer) {
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
}

function writeReport(backend, key, report) {
  return backend.put(key, `${JSON.stringify({ key, findings: report.findings })}\n`);
}

export function createFindingsCache({
  store,
  directory,
  mergeBaseSha,
  projectRelativePath,
  configOverrides = [],
  headPolicy = {},
  codeFingerprint = computeCodeFingerprint(PACKAGE_ROOT),
}) {
  const backend = store ?? createDirectoryStore(directory);
  function keyFor(analyzer) {
    return cacheKey({
      mergeBaseSha,
      projectRelativePath,
      analyzer,
      configOverrides,
      headPolicy,
      codeFingerprint,
    });
  }
  return {
    read(analyzer) {
      const outcome = attempt(() => readReport(backend, keyFor(analyzer), analyzer));
      return outcome.kind === 'done' ? outcome.value : undefined;
    },
    write(analyzer, report) {
      const outcome = attempt(() => writeReport(backend, keyFor(analyzer), report));
      return outcome.kind === 'done' ? outcome.value : false;
    },
    servedBy(analyzer) {
      return store === undefined ? directory : store.servedBy?.(keyFor(analyzer));
    },
  };
}

function attempt(action) {
  try {
    return { kind: 'done', value: action() };
  } catch (error) {
    return { kind: 'failed', error };
  }
}

export function runBaseWithCache({ cache, analyzers, run, resolveContext, onCached }) {
  const cached = readCachedReports(cache, analyzers, resolveContext);
  if (cached.size > 0) {
    const sources = analyzers
      .filter(({ name }) => cached.has(name))
      .map((analyzer) => cache.servedBy?.(analyzer));
    onCached?.(
      cached.size,
      [...new Set(sources)].filter((source) => source !== undefined),
    );
  }

  const toRun = uncachedDependencies(cached, analyzers);

  const result =
    toRun.size === 0
      ? { reports: new Map(), timings: new Map(), toolErrors: [] }
      : run(analyzers.filter(({ name }) => toRun.has(name)));
  for (const analyzer of analyzers) applyCachedReport(analyzer, { result, cached, cache });
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

function uncachedDependencies(cached, analyzers) {
  const byName = new Map(analyzers.map((analyzer) => [analyzer.name, analyzer]));
  const toRun = new Set(analyzers.filter(({ name }) => !cached.has(name)).map(({ name }) => name));
  const pending = [...toRun];
  for (const name of pending) {
    const dependencies = (byName.get(name)?.dependencies ?? []).filter(
      (dependency) => !toRun.has(dependency) && byName.has(dependency),
    );
    for (const dependency of dependencies) {
      toRun.add(dependency);
      pending.push(dependency);
    }
  }

  return toRun;
}

function applyCachedReport(analyzer, { result, cached, cache }) {
  const report = result.reports.get(analyzer.name);
  if (report === undefined) {
    const hit = cached.get(analyzer.name);
    if (hit !== undefined) result.reports.set(analyzer.name, hit);
    return;
  }
  if (isCacheable(analyzer, report, result)) cache.write(analyzer, report);
}
