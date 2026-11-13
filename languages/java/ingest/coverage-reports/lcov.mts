import {
  coverageMetricFinding,
  normalizeReportPath,
  uncoveredFinding,
} from '../../../../shared/ingest/common.mjs';

const TOOL = 'lcov';

type LcovOptions = { readonly root?: string };
type LcovRecord = {
  readonly path: string | undefined;
  readonly lines: Map<string | undefined, boolean>;
  readonly functions: Map<string, number>;
};
type RecordHandler = (record: LcovRecord, payload: string) => void;
type LcovFinding = ReturnType<typeof coverageMetricFinding> | ReturnType<typeof uncoveredFinding>;

const RECORD_HANDLERS: readonly (readonly [string, RecordHandler])[] = [
  ['DA:', recordLineHits],
  ['FN:', recordFunctionDeclaration],
  ['FNDA:', recordFunctionHits],
];

export function ingestLcov(text: string, options: LcovOptions = {}): { findings: LcovFinding[] } {
  const findings = parseRecords(text, options.root).flatMap((record) =>
    recordFindings(record, TOOL),
  );
  return { findings };
}

function parseRecords(text: string, root: string | undefined): LcovRecord[] {
  const records: LcovRecord[] = [];
  let record: LcovRecord | undefined;
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

function startRecord(line: string, root: string | undefined): LcovRecord {
  return {
    path: normalizeReportPath(line.slice(3), root),
    lines: new Map(),
    functions: new Map(),
  };
}

function applyRecordLine(record: LcovRecord, line: string): void {
  const handler = RECORD_HANDLERS.find(([prefix]) => line.startsWith(prefix));
  if (handler !== undefined) {
    const [prefix, apply] = handler;
    apply(record, line.slice(prefix.length));
  }
}

function recordLineHits(record: LcovRecord, payload: string): void {
  const [lineNumber, hits] = payload.split(',');
  record.lines.set(lineNumber, Number(hits) > 0);
}

function recordFunctionDeclaration(record: LcovRecord, payload: string): void {
  const name = payload.split(',').slice(1).join(',');
  record.functions.set(name, record.functions.get(name) ?? 0);
}

function recordFunctionHits(record: LcovRecord, payload: string): void {
  const [hits, ...nameParts] = payload.split(',');
  record.functions.set(nameParts.join(','), Number(hits));
}

function recordFindings(record: LcovRecord, tool: string): LcovFinding[] {
  if (record.path === undefined) {
    return [];
  }
  return [...lineCoverageFindings(record, tool), ...uncoveredFunctionFindings(record, tool)];
}

function lineCoverageFindings(record: LcovRecord, tool: string): LcovFinding[] {
  const total = record.lines.size;
  if (total === 0) {
    return [];
  }
  const covered = [...record.lines.values()].filter(Boolean).length;
  return [
    coverageMetricFinding({ tool, path: record.path, name: 'line-coverage', covered, total }),
  ];
}

function uncoveredFunctionFindings(record: LcovRecord, tool: string): LcovFinding[] {
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
