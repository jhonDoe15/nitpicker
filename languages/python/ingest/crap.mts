import { ingestCrapRows } from '../../../shared/ingest/lizard-crap.mjs';
import { normalizeReportPath } from '../../../shared/ingest/common.mjs';
import { fieldOf, parseJson } from '../../../shared/values/readers.mts';
import { isFileTable } from './typed/coverage-types.mts';
import type { IngestedFinding } from './typed/ingest-types.mts';
import type {
  CoverageFileData,
  CoverageFunctionData,
  CoverageSummary,
  CrapOptions,
  FileCoverage,
  FunctionCoverage,
  LineCoverage,
  PythonFunctionEntry,
  Roots,
  ScoredFunction,
} from './typed/coverage-types.mts';

const FULLY_COVERED = 100;

type Span = {
  readonly start: number;
  readonly end: number;
};

function scoredFunctions(entries: readonly PythonFunctionEntry[]): ScoredFunction[] {
  return entries
    .filter(
      (entry) => (entry.lambda === true || entry.bodyStart > entry.definition) && !entry.overload,
    )
    .map((entry) => ({
      ccn: entry.complexity,
      file: entry.file,
      name: entry.name,
      start: entry.definition,
      end: entry.end,
      lambda: entry.lambda === true,
      statementLine: entry.statementLine,
      numberedAmongSameSource: true,
    }));
}

export function ingestPythonCrap(
  functions: readonly PythonFunctionEntry[],
  coverageJson: string,
  options: CrapOptions = {},
): { findings: IngestedFinding[] } {
  const files = coverageFiles(coverageJson, options.roots ?? [undefined]);
  const parsed = scoredFunctions(functions);
  const rows = parsed.map((row) => ({
    ...row,
    path: normalizeReportPath(row.file, options.root),
  }));
  return ingestCrapRows(parsed, options, (fn: ScoredFunction, filePath: string) => {
    const data = files.get(filePath);
    if (data === undefined) {
      return { name: fn.name };
    }
    if (fn.lambda) {
      return { coverage: statementCoverage(data.lines, fn.statementLine), name: fn.name };
    }
    const found = matchFunction(data.functions, fn);
    if (found !== undefined) {
      return { coverage: found.percent, name: fn.name };
    }
    const nested = rows.filter(
      (row) => row.path === filePath && row.start > fn.start && row.end <= fn.end,
    );
    return {
      coverage: coverageFromLines(data.lines, fn, nested),
      name: fn.name,
    };
  });
}

function statementCoverage(lines: LineCoverage, statementLine: number | undefined): number {
  return statementLine !== undefined && lines.missing.includes(statementLine) ? 0 : FULLY_COVERED;
}

function coverageFiles(text: string, roots: Roots): Map<string, FileCoverage> {
  const files = fieldOf(parseJson(text), 'files');
  if (!isFileTable(files)) {
    throw new TypeError('coverage.py JSON report must contain a files object');
  }
  const byFile = new Map<string, FileCoverage>();
  for (const [file, data] of Object.entries<CoverageFileData>(files)) {
    const filePath = roots
      .map((root) => normalizeReportPath(file, root))
      .find((candidate) => candidate !== undefined);
    if (filePath !== undefined) {
      byFile.set(filePath, {
        functions: Object.entries(data.functions ?? {})
          .filter(([name]) => name !== '')
          .map(([name, entry]) => describeFunction(name, entry)),
        lines: describeLines(data),
      });
    }
  }
  return byFile;
}

function describeFunction(name: string, entry: CoverageFunctionData): FunctionCoverage {
  const lines = [
    ...(entry.executed_lines ?? []),
    ...(entry.missing_lines ?? []),
    ...(entry.excluded_lines ?? []),
  ];
  return {
    name,
    first: lines.length === 0 ? undefined : Math.min(...lines),
    last: lines.length === 0 ? undefined : Math.max(...lines),
    percent: coveragePercent(entry.summary ?? {}),
  };
}

function describeLines(data: CoverageFileData): LineCoverage {
  return {
    executed: data.executed_lines ?? [],
    missing: data.missing_lines ?? [],
    executedBranches: data.executed_branches ?? [],
    missingBranches: data.missing_branches ?? [],
  };
}

function ownsLine(fn: ScoredFunction, nested: readonly Span[], line: number): boolean {
  return (
    line > fn.start &&
    line <= fn.end &&
    !nested.some((inner) => line > inner.start && line <= inner.end)
  );
}

function branchSource([from]: readonly [number, number]): number {
  return from;
}

function countOwn(lines: readonly number[], fn: ScoredFunction, nested: readonly Span[]): number {
  return lines.filter((line) => ownsLine(fn, nested, line)).length;
}

function coverageFromLines(
  lines: LineCoverage,
  fn: ScoredFunction,
  nested: readonly Span[],
): number {
  const covered = countOwn(lines.executed, fn, nested);
  const missed = countOwn(lines.missing, fn, nested);
  const executedBranches = countOwn(lines.executedBranches.map(branchSource), fn, nested);
  const missedBranches = countOwn(lines.missingBranches.map(branchSource), fn, nested);
  return covered + missed === 0
    ? FULLY_COVERED
    : coveragePercent({
        covered_lines: covered,
        num_statements: covered + missed,
        covered_branches: executedBranches,
        num_branches: executedBranches + missedBranches,
      });
}

function coveragePercent(summary: CoverageSummary): number {
  const pairs: [number, number][] = [
    [summary.covered_lines ?? 0, summary.num_statements ?? 0],
    [summary.covered_branches ?? 0, summary.num_branches ?? 0],
  ];
  const measures = pairs.filter(([, total]) => total > 0);
  return measures.length === 0
    ? 100
    : Math.min(...measures.map(([covered, total]) => (covered / total) * 100));
}

function namedLike(
  candidates: readonly FunctionCoverage[],
  fn: ScoredFunction,
): FunctionCoverage[] {
  return candidates.filter(({ name }) => name === fn.name);
}

function matchFunction(
  candidates: readonly FunctionCoverage[],
  fn: ScoredFunction,
): FunctionCoverage | undefined {
  const named = namedLike(candidates, fn);
  return named
    .filter(
      ({ first, last }) =>
        first !== undefined && last !== undefined && fn.start <= first && last <= fn.end,
    )
    .reduce<FunctionCoverage | undefined>(
      (best, candidate) =>
        best === undefined || (candidate.first ?? 0) < (best.first ?? 0) ? candidate : best,
      undefined,
    );
}
