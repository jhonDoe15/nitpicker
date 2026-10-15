import { coverageMetricFinding, normalizeReportPath, uncoveredFinding } from '../common.mjs';

export function ingestLcov(text, options = {}) {
  const tool = options.tool ?? 'lcov';
  const findings = [];
  let record;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('SF:')) {
      record = {
        path: normalizeReportPath(line.slice(3), options.root),
        lines: new Map(),
        functions: new Map(),
      };
    } else if (record === undefined) {
      continue;
    } else if (line.startsWith('DA:')) {
      const [lineNumber, hits] = line.slice(3).split(',');
      record.lines.set(lineNumber, Number(hits) > 0);
    } else if (line.startsWith('FN:')) {
      const name = line.slice(3).split(',').slice(1).join(',');
      record.functions.set(name, record.functions.get(name) ?? 0);
    } else if (line.startsWith('FNDA:')) {
      const [hits, ...nameParts] = line.slice(5).split(',');
      record.functions.set(nameParts.join(','), Number(hits));
    } else if (line === 'end_of_record') {
      findings.push(...recordFindings(record, tool));
      record = undefined;
    }
  }
  return { findings };
}

function recordFindings(record, tool) {
  if (record.path === undefined) {
    return [];
  }
  const found = [];
  const total = record.lines.size;
  if (total > 0) {
    const covered = [...record.lines.values()].filter(Boolean).length;
    found.push(
      coverageMetricFinding({ tool, path: record.path, name: 'line-coverage', covered, total }),
    );
  }
  for (const [name, hits] of record.functions) {
    if (hits === 0 && name !== '') {
      found.push(
        uncoveredFinding({
          tool,
          rule: 'uncovered-function',
          path: record.path,
          symbol: name,
          message: `Function ${name} is not covered`,
        }),
      );
    }
  }
  return found;
}
