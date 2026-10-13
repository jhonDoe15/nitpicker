import { ingestCrapRows, parseLizardCsv } from '../../java/ingest/crap.mjs';
import { normalizeReportPath } from '../../java/ingest/common.mjs';

export function ingestPythonCrap(lizardCsv, coverageJson, options = {}) {
  const files = coverageFiles(coverageJson, options.roots ?? [undefined]);
  const rows = parseLizardCsv(lizardCsv).map((row) => ({
    ...row,
    path: normalizeReportPath(row.file, options.root),
  }));
  return ingestCrapRows(lizardCsv, options, (fn, filePath) => {
    const data = files.get(filePath);
    if (data === undefined) {
      return { name: fn.name };
    }
    const found = matchFunction(data.functions, fn);
    if (found !== undefined) {
      return { coverage: found.percent, name: found.name };
    }
    const nested = rows.filter(
      (row) => row.path === filePath && row.start > fn.start && row.end <= fn.end,
    );
    return {
      coverage: coverageFromLines(data.lines, fn, nested),
      name: nearestName(data.functions, fn) ?? fn.name,
    };
  });
}

function coverageFiles(text, roots) {
  const report = JSON.parse(text);
  if (typeof report !== 'object' || report === null || typeof report.files !== 'object') {
    throw new TypeError('coverage.py JSON report must contain a files object');
  }
  const byFile = new Map();
  for (const [file, data] of Object.entries(report.files)) {
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

function describeFunction(name, entry) {
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

function describeLines(data) {
  return {
    executed: data.executed_lines ?? [],
    missing: data.missing_lines ?? [],
    executedBranches: data.executed_branches ?? [],
    missingBranches: data.missing_branches ?? [],
  };
}

function coverageFromLines(lines, fn, nested) {
  const own = (line) =>
    line > fn.start &&
    line <= fn.end &&
    !nested.some((inner) => line > inner.start && line <= inner.end);
  const covered = lines.executed.filter(own).length;
  const missed = lines.missing.filter(own).length;
  const executedBranches = lines.executedBranches.filter(([from]) => own(from)).length;
  const missedBranches = lines.missingBranches.filter(([from]) => own(from)).length;
  return covered + missed === 0
    ? undefined
    : coveragePercent({
        covered_lines: covered,
        num_statements: covered + missed,
        covered_branches: executedBranches,
        num_branches: executedBranches + missedBranches,
      });
}

function coveragePercent(summary) {
  const measures = [
    [summary.covered_lines, summary.num_statements],
    [summary.covered_branches, summary.num_branches],
  ].filter(([, total]) => total > 0);
  return measures.length === 0
    ? 100
    : Math.min(...measures.map(([covered, total]) => (covered / total) * 100));
}

function namedLike(candidates, fn) {
  return candidates.filter(({ name }) => name === fn.name || name.endsWith(`.${fn.name}`));
}

function nearestName(candidates, fn) {
  const distance = ({ first }) => Math.abs((first ?? fn.start) - fn.start);
  return namedLike(candidates, fn).sort((left, right) => distance(left) - distance(right))[0]?.name;
}

function matchFunction(candidates, fn) {
  const named = namedLike(candidates, fn);
  const inside = named
    .filter(({ first, last }) => first !== undefined && fn.start <= first && last <= fn.end)
    .sort((left, right) => left.first - right.first);
  return inside[0] ?? named.find(({ first }) => first === undefined);
}
