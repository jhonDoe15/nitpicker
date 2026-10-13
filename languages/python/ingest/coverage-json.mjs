import {
  coverageMetricFinding,
  normalizeReportPath,
  uncoveredFinding,
} from '../../../shared/ingest/common.mjs';

export function ingestCoverageJson(text, options = {}) {
  const tool = options.tool ?? 'coverage';
  const report = JSON.parse(text);
  if (!isRecord(report) || !isRecord(report.files)) {
    throw new TypeError('coverage.py JSON report must contain a files object');
  }
  const roots = options.roots ?? [undefined];
  const findings = Object.entries(report.files).flatMap(([file, data]) => {
    const filePath = roots
      .map((root) => normalizeReportPath(file, root))
      .find((candidate) => candidate !== undefined);
    return filePath === undefined ? [] : fileFindings({ tool, path: filePath, data });
  });
  return { findings };
}

function fileFindings({ tool, path, data }) {
  const statements = data.summary?.num_statements ?? 0;
  const metric =
    statements > 0
      ? [
          coverageMetricFinding({
            tool,
            path,
            name: 'line-coverage',
            covered: data.summary.covered_lines,
            total: statements,
          }),
        ]
      : [];
  const uncovered = Object.entries(data.functions ?? {})
    .filter(([name, entry]) => name !== '' && isNeverRun(entry))
    .map(([name]) =>
      uncoveredFinding({
        tool,
        rule: 'uncovered-function',
        path,
        symbol: name,
        message: `Function ${name} is not covered`,
      }),
    );
  return [...metric, ...uncovered];
}

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function isNeverRun(entry) {
  return entry.summary?.num_statements > 0 && entry.summary.covered_lines === 0;
}
