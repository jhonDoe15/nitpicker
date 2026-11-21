const SPLIT_ITEMS = 256;
const MAX_SPLIT_DEPTH = 8;
const WRITE_BATCH_CHARACTERS = 1024 * 1024;
const INDENT = '  ';

type Members = readonly (readonly [string, unknown])[];

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof Reflect.get(value, 'toJSON') !== 'function'
  );
}

function isOmitted(value: unknown): boolean {
  return value === undefined || typeof value === 'function' || typeof value === 'symbol';
}

function isOmittedMember(value: unknown): boolean {
  if (isOmitted(value)) {
    return true;
  }
  const converts =
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'toJSON') === 'function';
  return converts && JSON.stringify(value) === undefined;
}

function splits(value: unknown, depth: number): boolean {
  if (depth > MAX_SPLIT_DEPTH) {
    return false;
  }
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    return items.length >= SPLIT_ITEMS || items.some((item) => splits(item, depth + 1));
  }
  return isPlainRecord(value) && Object.values(value).some((item) => splits(item, depth + 1));
}

function membersOf(value: Readonly<Record<string, unknown>>): Members {
  return Object.entries(value).filter(([, item]) => !isOmittedMember(item));
}

function leafText(value: unknown, space: string): string {
  const text: unknown = JSON.stringify(isOmitted(value) ? null : value, null, space);
  return typeof text === 'string' ? text : 'null';
}

function* compactArray(items: readonly unknown[]): Generator<string> {
  yield '[\n';
  for (const [index, item] of items.entries()) {
    yield* compactValue(item);
    yield index < items.length - 1 ? ',\n' : '\n';
  }
  yield ']';
}

function* compactObject(members: Members): Generator<string> {
  yield '{\n';
  for (const [index, [key, item]] of members.entries()) {
    yield `${JSON.stringify(key)}:`;
    if (splits(item, 0)) {
      yield '\n';
    }
    yield* compactValue(item);
    yield index < members.length - 1 ? ',\n' : '\n';
  }
  yield '}';
}

function* compactValue(value: unknown): Generator<string> {
  if (!splits(value, 0)) {
    yield leafText(value, '');
  } else if (Array.isArray(value)) {
    yield* compactArray(value);
  } else if (isPlainRecord(value)) {
    yield* compactObject(membersOf(value));
  }
}

export function compactJsonLines(value: unknown): Iterable<string> {
  return compactValue(value);
}

function* prettyArray(items: readonly unknown[], indent: string): Generator<string> {
  const inner = indent + INDENT;
  yield '[';
  for (const [index, item] of items.entries()) {
    yield `${index === 0 ? '' : ','}\n${inner}`;
    yield* prettyValue(item, inner);
  }
  yield items.length === 0 ? ']' : `\n${indent}]`;
}

function* prettyObject(members: Members, indent: string): Generator<string> {
  const inner = indent + INDENT;
  yield '{';
  for (const [index, [key, item]] of members.entries()) {
    yield `${index === 0 ? '' : ','}\n${inner}${JSON.stringify(key)}: `;
    yield* prettyValue(item, inner);
  }
  yield members.length === 0 ? '}' : `\n${indent}}`;
}

function* prettyValue(value: unknown, indent: string): Generator<string> {
  if (!splits(value, 0)) {
    yield leafText(value, INDENT).replaceAll('\n', `\n${indent}`);
  } else if (Array.isArray(value)) {
    yield* prettyArray(value, indent);
  } else if (isPlainRecord(value)) {
    yield* prettyObject(membersOf(value), indent);
  }
}

export function prettyJsonPieces(value: unknown): Iterable<string> {
  return prettyValue(value, '');
}

export function writePieces(pieces: Iterable<string>, write: (text: string) => void): void {
  let batch: string[] = [];
  let characters = 0;
  for (const piece of pieces) {
    batch.push(piece);
    characters += piece.length;
    if (characters >= WRITE_BATCH_CHARACTERS) {
      write(batch.join(''));
      batch = [];
      characters = 0;
    }
  }
  if (batch.length > 0) {
    write(batch.join(''));
  }
}
