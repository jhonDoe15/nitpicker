import { unquote as untypedUnquote } from '../../../../adapters/spring/spring-config-parser.mts';
import { lineAt } from './lines.mts';
import type { Line, LineTable, LocateEntry, Range, Span } from './locate-types.mts';

const unquote: (text: string) => string = untypedUnquote;

type Parts = {
  readonly indent: number;
  readonly key?: Range;
  readonly name?: string;
  readonly value: Span | undefined;
};

type ValuedParts = Parts & { readonly value: Span };

type YamlLocated = {
  readonly first: number;
  readonly last: number;
  readonly indent: number;
  readonly name: string | undefined;
  readonly key: Range | undefined;
  readonly value: Span;
};

const BLOCK_STARTS = new Set(['&', '!', '|', '>', '{']);
const DOUBLE_QUOTED = /^"(?:[^"\\]|\\.)*"$/;
const SINGLE_QUOTED = /^'(?:[^']|'')*'$/;
const COMMENT_OR_QUOTED = /(?<=^|[\s:[,{])(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*')|(?<=^|\s)#/g;

function contentEnd(text: string): number {
  const comment = [...text.matchAll(COMMENT_OR_QUOTED)].find(([found]) => found === '#');
  return comment === undefined ? text.length : comment.index;
}

function keyEndOf(text: string, from: number): number | undefined {
  const first = text.charAt(from);
  const quote = first === '"' || first === "'" ? first : undefined;
  const close = quote === undefined ? from : text.indexOf(quote, from + 1);
  const colon = /:(\s|$)/.exec(text.slice(close < 0 ? from : close));
  return colon === null ? undefined : (close < 0 ? from : close) + colon.index;
}

function valueSpan(text: string, from: number, to: number): Span | undefined {
  const raw = text.slice(from, to).trimEnd();
  const end = from + raw.length;
  const head = raw.charAt(0);
  if (raw === '' || BLOCK_STARTS.has(head)) {
    return undefined;
  }
  if (head === '[') {
    return raw.endsWith(']') ? { start: from, end, quote: '', flow: true } : undefined;
  }
  if (head === '"' || head === "'") {
    const closed = head === '"' ? DOUBLE_QUOTED.test(raw) : SINGLE_QUOTED.test(raw);
    return closed ? { start: from, end, quote: head } : undefined;
  }
  return { start: from, end, quote: '' };
}

function skipSpaces(text: string, from: number): number {
  const rest = text.slice(from);
  return from + (rest.length - rest.trimStart().length);
}

function shifted<T extends Range>(span: T, shift: number): T {
  return { ...span, start: span.start + shift, end: span.end + shift };
}

function shiftedOrUndefined<T extends Range>(span: T | undefined, shift: number): T | undefined {
  return span === undefined ? undefined : shifted(span, shift);
}

function located(table: LineTable, lineNumber: number, parts: ValuedParts): YamlLocated {
  const line = lineAt(table, lineNumber - 1);
  return {
    first: lineNumber - 1,
    last: lineNumber - 1,
    indent: parts.indent,
    name: parts.name,
    key: shiftedOrUndefined(parts.key, line.start),
    value: shifted(parts.value, line.start),
  };
}

function itemParts(text: string, indent: number, end: number): Parts {
  const value = valueSpan(text, skipSpaces(text, indent + 1), end);
  return { indent, value };
}

function pairParts(text: string, indent: number, end: number): Parts | undefined {
  const colon = keyEndOf(text, indent);
  if (colon === undefined) {
    return undefined;
  }
  const key = { start: indent, end: colon };
  const name = unquote(text.slice(key.start, key.end).trim());
  return { indent, key, name, value: valueSpan(text, skipSpaces(text, colon + 1), end) };
}

function consistent(
  parts: Parts | undefined,
  entry: LocateEntry,
  text: string,
): parts is ValuedParts {
  if (parts?.value === undefined) {
    return false;
  }
  const raw = text.slice(parts.value.start, parts.value.end);
  if (parts.name === undefined) {
    return entry.list && unquote(raw) === entry.value;
  }
  const named = entry.key === parts.name || entry.key.endsWith(`.${parts.name}`);
  return named && (parts.value.flow ? entry.list : !entry.list && unquote(raw) === entry.value);
}

export function yamlAt(
  table: LineTable,
  lineNumber: number,
  entry: LocateEntry,
): YamlLocated | undefined {
  const line = table[lineNumber - 1];
  if (line === undefined) {
    return undefined;
  }
  const { text } = line;
  const indent = text.length - text.trimStart().length;
  const end = contentEnd(text);
  const parts = /^-(\s|$)/.test(text.slice(indent))
    ? itemParts(text, indent, end)
    : pairParts(text, indent, end);
  return consistent(parts, entry, text) ? located(table, lineNumber, parts) : undefined;
}

export function flowTokens(text: string): string[] {
  return [...text.slice(1, -1).matchAll(/"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^,]+/g)]
    .map(([token]) => token.trim())
    .filter((token) => token !== '');
}

export function parentLine(table: LineTable, index: number): number | undefined {
  const { indent } = indentOf(lineAt(table, index));
  const before = table.slice(0, index).map((line, at) => ({ line, at }));
  for (const { line, at } of before.reverse()) {
    const found = indentOf(line);
    if (found.structural && /^---/.test(line.text)) {
      return undefined;
    }
    if (found.structural && found.indent < indent) {
      return at;
    }
  }
  return undefined;
}

export function indentOf(line: Line): {
  readonly indent: number;
  readonly structural: boolean;
  readonly bare: boolean;
} {
  const content = line.text.slice(0, contentEnd(line.text));
  return {
    indent: line.text.length - line.text.trimStart().length,
    structural: content.trim() !== '',
    bare: /:\s*$/.test(content.trimEnd()) && !/^\s*-/.test(content),
  };
}

export function bareKeyAt(table: LineTable, index: number): Range | undefined {
  const line = lineAt(table, index);
  const parts = pairParts(line.text, indentOf(line).indent, contentEnd(line.text));
  return parts?.key === undefined ? undefined : shifted(parts.key, line.start);
}
