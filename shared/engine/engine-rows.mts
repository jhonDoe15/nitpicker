import { createReadStream, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

function parsed(text: string): unknown {
  const value: unknown = JSON.parse(text);
  return value;
}

export type EngineFinding = {
  readonly file: string;
  readonly rule: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
  readonly end?: { readonly line: number; readonly column: number };
};

const PARSE_FAILURE_RULE = '!parse';

function endOf(line: unknown, column: unknown): Pick<EngineFinding, 'end'> {
  return typeof line === 'number' && typeof column === 'number' ? { end: { line, column } } : {};
}

function findingOf(row: unknown): EngineFinding {
  const [file, rule, line, column, message, endLine, endColumn]: unknown[] = Array.isArray(row)
    ? row
    : [];
  if (
    typeof file !== 'string' ||
    typeof rule !== 'string' ||
    typeof line !== 'number' ||
    typeof column !== 'number' ||
    typeof message !== 'string'
  ) {
    throw new TypeError(
      `nitpicker-engine wrote a row that is not a finding: ${JSON.stringify(row)}`,
    );
  }
  return { file, rule, line, column, message, ...endOf(endLine, endColumn) };
}

export function engineFindings(report: unknown): EngineFinding[] {
  if (!Array.isArray(report)) {
    throw new TypeError('nitpicker-engine did not write a list of findings');
  }
  return report.map(findingOf);
}

export function readEngineFindings(file: string): EngineFinding[] {
  return engineFindings(parsed(readFileSync(file, 'utf8')));
}

export function unparsedFiles(findings: readonly EngineFinding[]): Set<string> {
  return new Set(
    findings.filter(({ rule }) => rule === PARSE_FAILURE_RULE).map(({ file }) => file),
  );
}

export async function* readEngineLines(file: string): AsyncGenerator<unknown, void> {
  const lines = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line !== '') {
      yield parsed(line);
    }
  }
}
