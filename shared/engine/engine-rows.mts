import { createReadStream, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { parseJson } from '../values/readers.mts';

export type EngineFinding = {
  readonly file: string;
  readonly rule: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
};

const PARSE_FAILURE_RULE = '!parse';

function findingOf(row: unknown): EngineFinding {
  const [file, rule, line, column, message]: unknown[] = Array.isArray(row) ? row : [];
  if (
    typeof file !== 'string' ||
    typeof rule !== 'string' ||
    typeof line !== 'number' ||
    typeof column !== 'number' ||
    typeof message !== 'string'
  ) {
    throw new TypeError(`nitpicker-engine wrote a row that is not a finding: ${JSON.stringify(row)}`);
  }
  return { file, rule, line, column, message };
}

export function engineFindings(report: unknown): EngineFinding[] {
  if (!Array.isArray(report)) {
    throw new TypeError('nitpicker-engine did not write a list of findings');
  }
  return report.map(findingOf);
}

export function readEngineFindings(file: string): EngineFinding[] {
  return engineFindings(parseJson(readFileSync(file, 'utf8')));
}

export function unparsedFiles(findings: readonly EngineFinding[]): Set<string> {
  return new Set(findings.filter(({ rule }) => rule === PARSE_FAILURE_RULE).map(({ file }) => file));
}

export async function* readEngineLines(file: string): AsyncGenerator<unknown, void> {
  const lines = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line !== '') {
      yield parseJson(line);
    }
  }
}
