import { readSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

const CHUNK_BYTES = 1024 * 1024;

type Frame = {
  readonly value: unknown[] | Record<string, unknown>;
  readonly key: string | undefined;
  pendingKey: string | undefined;
};

type LineState = { stack: Frame[]; root: { readonly value: unknown } | undefined };

const parseJson: (text: string) => unknown = JSON.parse;

function keyOf(text: string): string {
  const key = parseJson(text);
  if (typeof key !== 'string') {
    throw new SyntaxError(`Expected a property name in ${text.slice(0, 80)}`);
  }
  return key;
}

function setMember(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}

function attach(state: LineState, value: unknown, key: string | undefined): void {
  const parent = state.stack.at(-1);
  if (parent === undefined) {
    if (state.root !== undefined) {
      throw new SyntaxError('Unexpected data after the end of the JSON value');
    }
    state.root = { value };
  } else if (Array.isArray(parent.value)) {
    parent.value.push(value);
  } else if (key === undefined) {
    throw new SyntaxError('Expected a property name before the value');
  } else {
    setMember(parent.value, key, value);
  }
}

function takeKey(state: LineState): string | undefined {
  const parent = state.stack.at(-1);
  const key = parent?.pendingKey;
  if (parent !== undefined) {
    parent.pendingKey = undefined;
  }
  return key;
}

function open(state: LineState, value: unknown[] | Record<string, unknown>): void {
  const key = takeKey(state);
  state.stack.push({ value, key, pendingKey: undefined });
}

function close(state: LineState, array: boolean): void {
  const frame = state.stack.pop();
  if (frame === undefined || Array.isArray(frame.value) !== array) {
    throw new SyntaxError('Unexpected end of a JSON container');
  }
  attach(state, frame.value, frame.key);
}

function member(state: LineState, frame: Frame, line: string): void {
  if (line.endsWith(':')) {
    frame.pendingKey = keyOf(line.slice(0, -1));
    return;
  }
  const parsed = parseJson(`{${line}}`);
  for (const [key, value] of Object.entries(parsed ?? {})) {
    attach(state, value, key);
  }
}

function acceptLine(state: LineState, text: string): void {
  const line = text.endsWith(',') ? text.slice(0, -1) : text;
  const frame = state.stack.at(-1);
  if (line === '[' || line === '{') {
    open(state, line === '[' ? [] : {});
  } else if (line === ']' || line === '}') {
    close(state, line === ']');
  } else if (frame !== undefined && !Array.isArray(frame.value)) {
    member(state, frame, line);
  } else if (line.length > 0) {
    attach(state, parseJson(line), takeKey(state));
  }
}

function eachLine(descriptor: number, accept: (line: string) => void): void {
  const decoder = new StringDecoder('utf8');
  const buffer = Buffer.alloc(CHUNK_BYTES);
  let partial: string[] = [];
  let position = 0;
  let read = readSync(descriptor, buffer, 0, buffer.length, position);
  while (read > 0) {
    position += read;
    const text = decoder.write(buffer.subarray(0, read));
    let start = 0;
    let end = text.indexOf('\n', start);
    while (end !== -1) {
      accept(partial.join('') + text.slice(start, end));
      partial = [];
      start = end + 1;
      end = text.indexOf('\n', start);
    }
    partial.push(text.slice(start));
    read = readSync(descriptor, buffer, 0, buffer.length, position);
  }
  accept(partial.join('') + decoder.end());
}

function parsedLines(descriptor: number): unknown {
  const state: LineState = { stack: [], root: undefined };
  eachLine(descriptor, (line) => {
    acceptLine(state, line);
  });
  if (state.root === undefined || state.stack.length > 0) {
    throw new SyntaxError('Unexpected end of JSON input');
  }
  return state.root.value;
}

export function parseJsonDescriptor(descriptor: number, wholeText: () => string): unknown {
  try {
    return parsedLines(descriptor);
  } catch {
    return parseJson(wholeText());
  }
}
