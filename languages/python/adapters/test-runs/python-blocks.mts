import type { FunctionBlock, Logical, ScanState, Source } from './typed/run-types.mts';
import { appendAll } from '../../../../shared/lists/lists.mts';

const DEFINITION = /^\s*(?:async\s+)?def\s+(\w+)\s*\(/u;
const CLASS = /^\s*class\s+(\w+)/u;
const WORD = /\w+/gu;
const PARAM_CALL = /\bparam\s*\(/gu;
const PARENTHESES = /[()]/gu;
const SCOPE = /^\s*(?:class|(?:async\s+)?def)\s+(\w+)/u;
const DECORATOR = /^\s*@/u;
const MARKS = /^\s*pytestmark\s*[:=]/u;
const TOKEN = /\\.?|"""|'''|["'#()[\]{}]/gu;
const QUOTES = new Set(['"', "'", '"""', "'''"]);
const DEPTH: Readonly<Record<string, number>> = {
  '(': 1,
  '[': 1,
  '{': 1,
  ')': -1,
  ']': -1,
  '}': -1,
};
const COMMENT = '#';
const CONTINUATION = '\\';
const NO_QUOTE = '';

function at<Item>(items: readonly Item[], index: number): Item {
  const item = items[index];
  if (item === undefined) {
    throw new RangeError(`No entry at ${String(index)}`);
  }
  return item;
}

function indentOf(line: string): number {
  return (/^\s*/u.exec(line)?.[0] ?? '').length;
}

function isBlank(line: string): boolean {
  const text = line.trim();
  return text === '' || text.startsWith(COMMENT);
}

function inString(token: string, state: ScanState): void {
  const closes =
    !token.startsWith(CONTINUATION) &&
    token.startsWith(state.quote.charAt(0)) &&
    (state.quote.length === 1 || token === state.quote);
  state.quote = closes ? NO_QUOTE : state.quote;
}

function inCode(token: string, state: ScanState, atEnd: boolean): void {
  if (QUOTES.has(token)) {
    state.quote = token;
    return;
  }
  state.depth = Math.max(0, state.depth + (DEPTH[token] ?? 0));
  state.continued = token === CONTINUATION && atEnd;
}

function scanLine(line: string, state: ScanState): void {
  state.continued = false;
  for (const { 0: token, index } of line.matchAll(TOKEN)) {
    if (state.quote !== NO_QUOTE) {
      inString(token, state);
    } else if (token === COMMENT) {
      break;
    } else {
      inCode(token, state, index + token.length === line.length);
    }
  }
  state.quote = state.quote.length === 1 ? NO_QUOTE : state.quote;
}

function logicalLines(lines: readonly string[]): Logical[] {
  const state: ScanState = { depth: 0, quote: NO_QUOTE, continued: false };
  const logical: Logical[] = [];
  for (const [index, line] of lines.entries()) {
    if (state.depth > 0 || state.quote !== NO_QUOTE || state.continued) {
      at(logical, logical.length - 1).last = index;
    } else {
      logical.push({ first: index, last: index, indent: indentOf(line), blank: isBlank(line) });
    }
    scanLine(line, state);
  }
  return logical;
}

function textOf(lines: readonly string[], first: number, last: number): string {
  return lines.slice(first, last + 1).join('\n');
}

function bodyEnd(logical: readonly Logical[], position: number): number {
  const { indent } = at(logical, position);
  const rest = logical.slice(position + 1);
  const end = rest.findIndex((entry) => !entry.blank && entry.indent <= indent);
  const body = end === -1 ? rest : rest.slice(0, end);
  return position + 1 + body.findLastIndex((entry) => !entry.blank);
}

function decoratorsAbove({ logical, lines }: Source, position: number): number {
  const { indent } = at(logical, position);
  const above = logical
    .slice(0, position)
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !entry.blank)
    .reverse();
  const stop = above.findIndex(
    ({ entry }) => entry.indent !== indent || !DECORATOR.test(at(lines, entry.first)),
  );
  return (stop === -1 ? above : above.slice(0, stop)).at(-1)?.index ?? position;
}

function ownerOf(logical: readonly Logical[], position: number): number | undefined {
  const { indent } = at(logical, position);
  const owner = logical
    .slice(0, position)
    .findLastIndex((entry) => !entry.blank && entry.indent < indent);
  return owner === -1 ? undefined : owner;
}

function markLines(source: Source, from: number, to: number): string[] {
  const { logical, lines } = source;
  const indent = logical
    .slice(from + 1, to + 1)
    .find((entry) => !entry.blank && entry.indent > at(logical, from).indent)?.indent;
  return logical
    .slice(from + 1, to + 1)
    .filter((entry) => entry.indent === indent && MARKS.test(at(lines, entry.first)))
    .map((entry) => textOf(lines, entry.first, entry.last));
}

function decoratorText(source: Source, position: number): string[] {
  const first = decoratorsAbove(source, position);
  const { logical, lines } = source;
  return first === position
    ? []
    : [textOf(lines, at(logical, first).first, at(logical, position).first - 1)];
}

function classMarks(source: Source, position: number): string[] {
  const marks: string[] = [];
  const owners = [ownerOf(source.logical, position)].filter((owner) => owner !== undefined);
  for (const owner of owners) {
    if (CLASS.test(at(source.lines, at(source.logical, owner).first))) {
      const end = bodyEnd(source.logical, owner);
      appendAll(marks, [...decoratorText(source, owner), ...markLines(source, owner, end)]);
    }
    appendAll(
      owners,
      [ownerOf(source.logical, owner)].filter((next) => next !== undefined),
    );
  }
  return marks;
}

function moduleMarks({ logical, lines }: Source): string[] {
  return logical
    .filter((entry) => entry.indent === 0 && MARKS.test(at(lines, entry.first)))
    .map((entry) => textOf(lines, entry.first, entry.last));
}

function scopeChain(source: Source, position: number): string {
  const names: string[] = [];
  const owners = [ownerOf(source.logical, position)].filter((owner) => owner !== undefined);
  for (const owner of owners) {
    names.unshift(SCOPE.exec(at(source.lines, at(source.logical, owner).first))?.[1] ?? '');
    appendAll(
      owners,
      [ownerOf(source.logical, owner)].filter((next) => next !== undefined),
    );
  }
  return names.join('.');
}

function blockAt(source: Source, position: number): Omit<FunctionBlock, 'name'> {
  const { logical, lines } = source;
  const first = at(logical, decoratorsAbove(source, position)).first;
  const last = at(logical, bodyEnd(logical, position)).last;
  return {
    first,
    definition: at(logical, position).first,
    last,
    text: textOf(lines, first, last),
    owner: scopeChain(source, position),
    marks: [
      ...decoratorText(source, position),
      ...classMarks(source, position),
      ...moduleMarks(source),
    ],
  };
}

function sourceOf(text: string): Source {
  const lines = text.split(/\r?\n/u);
  return { lines, logical: logicalLines(lines) };
}

function statement({ lines }: Source, { first, last }: Logical): string {
  return lines
    .slice(first, last + 1)
    .map((line) => line.trim())
    .join('\n');
}

export function functionBlocks(text: string, name?: string): FunctionBlock[] {
  const source = sourceOf(text);
  return source.logical.flatMap((entry, position) => {
    const found = entry.blank ? undefined : DEFINITION.exec(at(source.lines, entry.first))?.[1];
    return found !== undefined && (name === undefined || found === name)
      ? [{ name: found, ...blockAt(source, position) }]
      : [];
  });
}

export function classHeader(text: string, chain: string): string | undefined {
  const source = sourceOf(text);
  const position = source.logical.findIndex(
    (entry, index) =>
      !entry.blank &&
      CLASS.test(at(source.lines, entry.first)) &&
      [scopeChain(source, index), CLASS.exec(at(source.lines, entry.first))?.[1]]
        .filter(Boolean)
        .join('.') === chain,
  );
  return position === -1 ? undefined : statement(source, at(source.logical, position));
}

export function mentions(text: string, name: string): string[] {
  const source = sourceOf(text);
  return source.logical
    .filter(
      (entry) =>
        !entry.blank &&
        [...textOf(source.lines, entry.first, entry.last).matchAll(WORD)].some(
          ([word]) => word === name,
        ),
    )
    .map((entry) => statement(source, entry));
}

function closingParenthesis(text: string, start: number): number {
  let depth = 1;
  for (const { 0: token, index } of text.slice(start).matchAll(PARENTHESES)) {
    depth += token === '(' ? 1 : -1;
    if (depth === 0) {
      return start + index + 1;
    }
  }
  return text.length;
}

export function withoutParamCalls(text: string): string {
  const kept: string[] = [];
  let from = 0;
  for (const match of text.matchAll(PARAM_CALL)) {
    if (match.index >= from) {
      kept.push(text.slice(from, match.index));
      from = closingParenthesis(text, match.index + match[0].length);
    }
  }
  return [...kept, text.slice(from)].join('');
}
