import { ingestCrapRows } from '../../java/ingest/crap.mjs';
import { normalizeReportPath } from '../../java/ingest/common.mjs';

export function ingestPythonCrap(lizardCsv, coverageJson, options = {}) {
  const functions = coverageFunctions(coverageJson, options.roots ?? [undefined]);
  return ingestCrapRows(lizardCsv, options, (fn, filePath) => {
    const found = matchFunction(functions.get(filePath) ?? [], fn);
    return { coverage: found?.percent, name: found?.name ?? fn.name };
  });
}

function coverageFunctions(text, roots) {
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
      byFile.set(
        filePath,
        Object.entries(data.functions ?? {})
          .filter(([name]) => name !== '')
          .map(([name, entry]) => describeFunction(name, entry)),
      );
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

function coveragePercent(summary) {
  const measures = [
    [summary.covered_lines, summary.num_statements],
    [summary.covered_branches, summary.num_branches],
  ].filter(([, total]) => total > 0);
  return measures.length === 0
    ? 100
    : Math.min(...measures.map(([covered, total]) => (covered / total) * 100));
}

function matchFunction(candidates, fn) {
  const named = candidates.filter(({ name }) => name === fn.name || name.endsWith(`.${fn.name}`));
  const inside = named
    .filter(({ first, last }) => first !== undefined && fn.start <= first && last <= fn.end)
    .sort((left, right) => left.first - right.first);
  return inside[0] ?? named.find(({ first }) => first === undefined);
}
