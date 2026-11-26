import { closeSync, createReadStream, openSync, readFileSync, readSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { StringDecoder } from 'node:string_decoder';

const CHUNK_BYTES = 1024 * 1024;

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
  readonly conditions?: readonly (readonly [string, string])[];
};

const PARSE_FAILURE_RULE = '!parse';
const NO_TYPES_RULE = '!types';

function endOf(line: unknown, column: unknown): Pick<EngineFinding, 'end'> {
  return typeof line === 'number' && typeof column === 'number' ? { end: { line, column } } : {};
}

function cellsOf(row: unknown): readonly unknown[] {
  return Array.isArray(row) ? row : [];
}

function conditionsOf(cell: unknown): Pick<EngineFinding, 'conditions'> {
  const conditions = cellsOf(cell).map((pair) => cellsOf(pair).map(String));
  return conditions.length === 0
    ? {}
    : { conditions: conditions.map(([kind = '', value = '']) => [kind, value] as const) };
}

function findingOf(row: unknown): EngineFinding {
  const [file, rule, line, column, message, endLine, endColumn, conditions] = cellsOf(row);
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
  return {
    file,
    rule,
    line,
    column,
    message,
    ...endOf(endLine, endColumn),
    ...conditionsOf(conditions),
  };
}

export function engineFindingOf(finding: unknown): EngineFinding {
  const fields = new Map<string, unknown>(
    typeof finding === 'object' && finding !== null ? Object.entries(finding) : [],
  );
  return {
    file: String(fields.get('file')),
    rule: String(fields.get('rule')),
    line: Number(fields.get('line')),
    column: Number(fields.get('column')),
    message: String(fields.get('message')),
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

function filesWithout(
  files: readonly string[],
  findings: readonly EngineFinding[],
  markers: readonly string[],
): string[] {
  const marked = new Set<string>();
  for (const { rule, file } of findings) {
    if (markers.includes(rule)) {
      marked.add(file);
    }
  }
  return files.filter((file) => !marked.has(file));
}

export function parsedFiles(
  files: readonly string[],
  findings: readonly EngineFinding[],
): string[] {
  return filesWithout(files, findings, [PARSE_FAILURE_RULE]);
}

export function typedFiles(files: readonly string[], findings: readonly EngineFinding[]): string[] {
  return filesWithout(files, findings, [PARSE_FAILURE_RULE, NO_TYPES_RULE]);
}

export async function* readEngineLines(file: string): AsyncGenerator<unknown, void> {
  const lines = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line !== '') {
      yield parsed(line);
    }
  }
}

export function byteChunks(descriptor: number): Iterable<Buffer> {
  const buffer = Buffer.alloc(CHUNK_BYTES);
  const reached = { position: 0 };
  return {
    [Symbol.iterator]: () => ({
      next: (): IteratorResult<Buffer> => {
        const read = readSync(descriptor, buffer, 0, buffer.length, reached.position);
        reached.position += read;
        return read > 0
          ? { done: false, value: buffer.subarray(0, read) }
          : { done: true, value: undefined };
      },
    }),
  };
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
