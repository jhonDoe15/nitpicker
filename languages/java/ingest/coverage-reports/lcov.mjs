import { coverageMetricFinding, normalizeReportPath, uncoveredFinding } from '../common.mjs';

const RECORD_HANDLERS = [
  ['DA:', recordLineHits],
  ['FN:', recordFunctionDeclaration],
  ['FNDA:', recordFunctionHits],
];

export function ingestLcov(text, options = {}) {
  const tool = options.tool ?? 'lcov';
  const findings = parseRecords(text, options.root).flatMap((record) =>
    recordFindings(record, tool),
  );
  return { findings };
}

function parseRecords(text, root) {
  const records = [];
  let record;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('SF:')) {
      record = startRecord(line, root);
      continue;
    }
    if (record === undefined) {
      continue;
    }
    if (line === 'end_of_record') {
      records.push(record);
      record = undefined;
      continue;
    }
    applyRecordLine(record, line);
  }
  return records;
}

function startRecord(line, root) {
  return {
    path: normalizeReportPath(line.slice(3), root),
    lines: new Map(),
    functions: new Map(),
  };
}

function applyRecordLine(record, line) {
  const handler = RECORD_HANDLERS.find(([prefix]) => line.startsWith(prefix));
  if (handler !== undefined) {
    handler[1](record, line.slice(handler[0].length));
  }
}

function recordLineHits(record, payload) {
  const [lineNumber, hits] = payload.split(',');
  record.lines.set(lineNumber, Number(hits) > 0);
}

function recordFunctionDeclaration(record, payload) {
  const name = payload.split(',').slice(1).join(',');
  record.functions.set(name, record.functions.get(name) ?? 0);
}

function recordFunctionHits(record, payload) {
  const [hits, ...nameParts] = payload.split(',');
  record.functions.set(nameParts.join(','), Number(hits));
}

function recordFindings(record, tool) {
  if (record.path === undefined) {
    return [];
  }
  return [...lineCoverageFindings(record, tool), ...uncoveredFunctionFindings(record, tool)];
}

function lineCoverageFindings(record, tool) {
  const total = record.lines.size;
  if (total === 0) {
    return [];
  }
  const covered = [...record.lines.values()].filter(Boolean).length;
  return [
    coverageMetricFinding({ tool, path: record.path, name: 'line-coverage', covered, total }),
  ];
}

function uncoveredFunctionFindings(record, tool) {
  return [...record.functions]
    .filter(([name, hits]) => hits === 0 && name !== '')
    .map(([name]) =>
      uncoveredFinding({
        tool,
        rule: 'uncovered-function',
        path: record.path,
        symbol: name,
        message: `Function ${name} is not covered`,
      }),
    );
}
