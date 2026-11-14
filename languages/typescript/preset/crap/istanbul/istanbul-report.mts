import { readFileSync } from 'node:fs';
import path from 'node:path';
import { listOf } from '../../../../../shared/values/readers.mts';
import type { BranchUnit, Fields, FileCoverage, StatementUnit } from '../crap-types.mts';
import { deduplicateFunctions, parseFunctions } from './function-entries.mts';
import { finiteNumberOf, isPlainObject, parseLineSpan, parseSpan, spanKey } from './spans.mts';

export function normalizePathForMatch(filePath: string): string {
  return path.resolve(filePath).replaceAll('\\', '/').toLowerCase();
}

function deduplicateStatements(statements: readonly StatementUnit[]): StatementUnit[] {
  const byKey = new Map<string, StatementUnit>();
  for (const statement of statements) {
    const key = spanKey(statement.span);
    const existing = byKey.get(key);
    if (!existing || statement.hits > existing.hits) {
      byKey.set(key, statement);
    }
  }
  return [...byKey.values()];
}

function mergeHits(existing: readonly number[], next: readonly number[]): number[] {
  return [
    ...next.map((hits, index) => Math.max(hits, existing[index] ?? 0)),
    ...existing.slice(next.length),
  ];
}

function deduplicateBranches(branches: readonly BranchUnit[]): BranchUnit[] {
  const byKey = new Map<string, BranchUnit>();
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

function parseStatements(statementMap: unknown, hitsByKey: unknown): StatementUnit[] {
  if (!(isPlainObject(statementMap) && isPlainObject(hitsByKey))) {
    return [];
  }
  const statements = Object.entries(statementMap).flatMap(([key, location]) => {
    const hits = finiteNumberOf(hitsByKey[key]);
    const span = parseSpan(location);
    return hits === undefined || span === undefined ? [] : [{ span, hits }];
  });
  return deduplicateStatements(statements);
}

function firstLocationSpan(locations: unknown) {
  return Array.isArray(locations)
    ? listOf(locations)
        .map(parseSpan)
        .find((span) => span !== undefined)
    : undefined;
}

function branchSpanOf(branch: Fields) {
  return parseSpan(branch.loc) ?? firstLocationSpan(branch.locations) ?? parseLineSpan(branch.line);
}

function branchUnitOf(branch: unknown, hitsValue: unknown): BranchUnit | undefined {
  if (!isPlainObject(branch)) {
    return undefined;
  }
  const hits = Array.isArray(hitsValue)
    ? listOf(hitsValue)
        .map(finiteNumberOf)
        .filter((hit) => hit !== undefined)
    : [];
  const span = branchSpanOf(branch);
  return hits.length === 0 || span === undefined ? undefined : { span, hits };
}

function parseBranches(branchMap: unknown, hitsByKey: unknown): BranchUnit[] {
  if (!(isPlainObject(branchMap) && isPlainObject(hitsByKey))) {
    return [];
  }
  const branches = Object.entries(branchMap)
    .map(([key, branch]) => branchUnitOf(branch, hitsByKey[key]))
    .filter((branch) => branch !== undefined);
  return deduplicateBranches(branches);
}

function entryOf(
  [key, value]: readonly [string, unknown],
  sourceRoot: string,
): { readonly normalizedPath: string; readonly coverage: FileCoverage } | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const sourcePath = typeof value.path === 'string' ? value.path : key;
  if (!sourcePath) {
    return undefined;
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

function mergeEntries(
  entries: readonly { readonly normalizedPath: string; readonly coverage: FileCoverage }[],
): Map<string, FileCoverage> {
  const merged = new Map<string, FileCoverage>();
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

function readJson(reportPath: string): unknown {
  try {
    return JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (error) {
    throw new CoverageReportParseError(`Coverage report at ${reportPath} could not be parsed`, {
      cause: error,
    });
  }
}

export function parseCoverageReport(
  reportPath: string,
  sourceRoot: string,
): Map<string, FileCoverage> {
  const raw = readJson(reportPath);
  const report = isPlainObject(raw) ? raw : {};
  return mergeEntries(
    Object.entries(report)
      .map((entry) => entryOf(entry, sourceRoot))
      .filter((entry) => entry !== undefined),
  );
}
