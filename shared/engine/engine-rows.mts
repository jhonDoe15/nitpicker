import { closeSync, createReadStream, openSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { StringDecoder } from 'node:string_decoder';
import { byteChunks } from '../filesystem.mts';
import { fieldOf } from '../values/readers.mts';

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

function cellsOf(row: unknown): readonly unknown[] {
  return Array.isArray(row) ? row : [];
}

function findingOf(row: unknown): EngineFinding {
  const [file, rule, line, column, message, endLine, endColumn] = cellsOf(row);
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

export function engineFindingOf(finding: unknown): EngineFinding {
  return {
    file: String(fieldOf(finding, 'file')),
    rule: String(fieldOf(finding, 'rule')),
    line: Number(fieldOf(finding, 'line')),
    column: Number(fieldOf(finding, 'column')),
    message: String(fieldOf(finding, 'message')),
  };
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

export function parsedFiles(
  files: readonly string[],
  findings: readonly EngineFinding[],
): string[] {
  const unparsed = new Set<string>();
  for (const { rule, file } of findings) {
    if (rule === PARSE_FAILURE_RULE) {
      unparsed.add(file);
    }
  }
  return files.filter((file) => !unparsed.has(file));
}

export async function* readEngineLines(file: string): AsyncGenerator<unknown, void> {
  const lines = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line !== '') {
      yield parsed(line);
    }
  }
}

function* textChunks(descriptor: number): Generator<string, void> {
  const decoder = new StringDecoder('utf8');
  for (const chunk of byteChunks(descriptor)) {
    yield decoder.write(chunk);
  }
  yield decoder.end();
}

export function* readEngineLinesSync<Line>(
  file: string,
  parse: (text: string) => Line,
): Generator<Line, void> {
  const descriptor = openSync(file, 'r');
  try {
    let pending: string[] = [];
    for (const chunk of textChunks(descriptor)) {
      const parts = chunk.split('\n');
      const last = parts.pop() ?? '';
      if (parts.length > 0) {
        parts[0] = [...pending, parts[0]].join('');
        pending = [];
      }
      pending.push(last);
      yield* parts.filter((line) => line !== '').map((line) => parse(line));
    }
    const rest = pending.join('');
    if (rest !== '') {
      yield parse(rest);
    }
  } finally {
    closeSync(descriptor);
  }
}
