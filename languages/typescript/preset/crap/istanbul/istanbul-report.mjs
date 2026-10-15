import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isPlainObject } from '../../../../../shared/config.mjs';
import { deduplicateFunctions, parseFunctions } from './function-entries.mjs';
import { finiteNumberOrNull, parseLineSpan, parseSpan, spanKey } from './spans.mjs';

export function normalizePathForMatch(filePath) {
  return path.resolve(filePath).replaceAll('\\', '/').toLowerCase();
}

export function deduplicateStatements(statements) {
  const byKey = new Map();
  for (const statement of statements) {
    const key = spanKey(statement.span);
    const existing = byKey.get(key);
    if (!existing || statement.hits > existing.hits) {
      byKey.set(key, statement);
    }
  }
  return [...byKey.values()];
}

function mergeHits(existing, next) {
  return [
    ...next.map((hits, index) => Math.max(hits, existing[index] ?? 0)),
    ...existing.slice(next.length),
  ];
}

export function deduplicateBranches(branches) {
  const byKey = new Map();
  for (const branch of branches) {
    const key = spanKey(branch.span);
    const existing = byKey.get(key);
    byKey.set(
      key,
      existing ? { span: branch.span, hits: mergeHits(existing.hits, branch.hits) } : branch,
    );
  }
  return [...byKey.values()];
}

function parseStatements(statementMap, hitsByKey) {
  if (!isPlainObject(statementMap) || !isPlainObject(hitsByKey)) {
    return [];
  }
  const statements = Object.entries(statementMap).flatMap(([key, location]) => {
    const hits = finiteNumberOrNull(hitsByKey[key]);
    const span = parseSpan(location);
    return hits === null || span === null ? [] : [{ span, hits }];
  });
  return deduplicateStatements(statements);
}

function firstLocationSpan(locations) {
  return Array.isArray(locations)
    ? (locations.map(parseSpan).find((span) => span !== null) ?? null)
    : null;
}

function branchSpanOf(branch) {
  return parseSpan(branch.loc) ?? firstLocationSpan(branch.locations) ?? parseLineSpan(branch.line);
}

function branchUnitOf(branch, hitsValue) {
  if (!isPlainObject(branch)) {
    return null;
  }
  const hits = Array.isArray(hitsValue)
    ? hitsValue.map(finiteNumberOrNull).filter((hit) => hit !== null)
    : [];
  const span = branchSpanOf(branch);
  return hits.length === 0 || span === null ? null : { span, hits };
}

function parseBranches(branchMap, hitsByKey) {
  if (!isPlainObject(branchMap) || !isPlainObject(hitsByKey)) {
    return [];
  }
  const branches = Object.entries(branchMap)
    .map(([key, branch]) => branchUnitOf(branch, hitsByKey[key]))
    .filter((branch) => branch !== null);
  return deduplicateBranches(branches);
}

function entryOf([key, value], sourceRoot) {
  if (!isPlainObject(value)) {
    return null;
  }
  const sourcePath = typeof value.path === 'string' ? value.path : key;
  if (!sourcePath) {
    return null;
  }
  return {
    normalizedPath: normalizePathForMatch(path.resolve(sourceRoot, sourcePath)),
    coverage: {
      statements: parseStatements(value.statementMap, value.s),
      branches: parseBranches(value.branchMap, value.b),
      functions: parseFunctions(value.fnMap),
    },
  };
}

function mergeEntries(entries) {
  const merged = new Map();
  for (const { normalizedPath, coverage } of entries) {
    const known = merged.get(normalizedPath) ?? { statements: [], branches: [], functions: [] };
    merged.set(normalizedPath, {
      statements: deduplicateStatements([...known.statements, ...coverage.statements]),
      branches: deduplicateBranches([...known.branches, ...coverage.branches]),
      functions: deduplicateFunctions([...known.functions, ...coverage.functions]),
    });
  }
  return merged;
}

export class CoverageReportParseError extends Error {}

function readJson(reportPath) {
  try {
    return JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (error) {
    throw new CoverageReportParseError(`Coverage report at ${reportPath} could not be parsed`, {
      cause: error,
    });
  }
}

export function parseCoverageReport(reportPath, sourceRoot) {
  const raw = readJson(reportPath);
  const report = isPlainObject(raw) ? raw : {};
  return mergeEntries(
    Object.entries(report)
      .map((entry) => entryOf(entry, sourceRoot))
      .filter((entry) => entry !== null),
  );
}
