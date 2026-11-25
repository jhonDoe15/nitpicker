import { appendAll } from '../../lists/lists.mts';
import { flattened } from './piece-frames.mts';
const SPLIT_ITEMS = 256;
const MAX_SPLIT_DEPTH = 8;
const WRITE_BATCH_CHARACTERS = 1024 * 1024;
const INDENT = '  ';

type Members = readonly (readonly [string, unknown])[];
type Child = { readonly child: unknown; readonly indent: string };
type Piece = string | Child;

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
  const text: unknown = converts ? JSON.stringify(value) : '';
  return text === undefined;
}

function childrenOf(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    return items;
  }
  return isPlainRecord(value) ? Object.values(value) : [];
}

function splits(value: unknown): boolean {
  const pending: { readonly value: unknown; readonly depth: number }[] = [{ value, depth: 0 }];
  for (const current of pending) {
    if (Array.isArray(current.value) && current.value.length >= SPLIT_ITEMS) {
      return true;
    }
    if (current.depth < MAX_SPLIT_DEPTH) {
      appendAll(
        pending,
        childrenOf(current.value).map((item) => ({ value: item, depth: current.depth + 1 })),
      );
    }
  }
  return false;
}

function membersOf(value: Readonly<Record<string, unknown>>): Members {
  return Object.entries(value).filter(([, item]) => !isOmittedMember(item));
}

function leafText(value: unknown, space: string): string {
  const text: unknown = JSON.stringify(isOmitted(value) ? null : value, null, space);
  return typeof text === 'string' ? text : 'null';
}

function* compactArray(items: readonly unknown[]): Generator<Piece> {
  yield '[\n';
  for (const [index, item] of items.entries()) {
    yield { child: item, indent: '' };
    yield index < items.length - 1 ? ',\n' : '\n';
  }
  yield ']';
}

function* compactObject(members: Members): Generator<Piece> {
  yield '{\n';
  for (const [index, [key, item]] of members.entries()) {
    yield `${JSON.stringify(key)}:`;
    if (splits(item)) {
      yield '\n';
    }
    yield { child: item, indent: '' };
    yield index < members.length - 1 ? ',\n' : '\n';
  }
  yield '}';
}

function* compactValue(value: unknown): Generator<Piece> {
  if (!splits(value)) {
    yield leafText(value, '');
  } else if (Array.isArray(value)) {
    yield* compactArray(value);
  } else if (isPlainRecord(value)) {
    yield* compactObject(membersOf(value));
  }
}

export function compactJsonLines(value: unknown): Iterable<string> {
  return flattened(compactValue(value), ({ child }) => compactValue(child));
}

function* prettyArray(items: readonly unknown[], indent: string): Generator<Piece> {
  const inner = indent + INDENT;
  yield '[';
  for (const [index, item] of items.entries()) {
    yield `${index === 0 ? '' : ','}\n${inner}`;
    yield { child: item, indent: inner };
  }
  yield items.length === 0 ? ']' : `\n${indent}]`;
}

function* prettyObject(members: Members, indent: string): Generator<Piece> {
  const inner = indent + INDENT;
  yield '{';
  for (const [index, [key, item]] of members.entries()) {
    yield `${index === 0 ? '' : ','}\n${inner}${JSON.stringify(key)}: `;
    yield { child: item, indent: inner };
  }
  yield members.length === 0 ? '}' : `\n${indent}}`;
}

function* prettyValue(value: unknown, indent: string): Generator<Piece> {
  if (!splits(value)) {
    yield leafText(value, INDENT).replaceAll('\n', () => `\n${indent}`);
  } else if (Array.isArray(value)) {
    yield* prettyArray(value, indent);
  } else if (isPlainRecord(value)) {
    yield* prettyObject(membersOf(value), indent);
  }
}

function prettyChild({ child, indent }: Child): Iterator<Piece> {
  return prettyValue(child, indent);
}

export function prettyJsonPieces(value: unknown): Iterable<string> {
  return flattened(prettyValue(value, ''), prettyChild);
}

export function* prettyJsonItems(items: Iterable<unknown>): Generator<string> {
  let count = 0;
  yield '[';
  for (const item of items) {
    yield `${count === 0 ? '' : ','}\n${INDENT}`;
    yield* flattened(prettyValue(item, INDENT), prettyChild);
    count += 1;
  }
  yield count === 0 ? ']' : '\n]';
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
