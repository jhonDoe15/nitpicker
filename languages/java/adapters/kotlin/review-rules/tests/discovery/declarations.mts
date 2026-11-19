import { lastSegment } from '../../../scan/typed/last-segment.mts';
import { groupOf } from '../typed/indexing.mts';
import type { ClassInfo, Header, SuperType, TestScanned } from '../typed/discovery-types.mts';

type PrecedingToken =
  { start: number; name: string; args: string } | { start: number; word: string };
type OwnerEvent =
  | { at: number; klass: ClassInfo; offset?: undefined }
  | { at: number; offset: number; klass?: undefined };
type HeaderState = { depth: number; angle: number; colon: number };
type HeaderEnd = { bodyOpen: number; end: number; colon: number };
import {
  closeOf,
  execAt,
  marksFrom,
  matchingOpen,
  nextSignificant,
  previousSignificant,
  remembered,
  repeatUntil,
  trimmedEnd,
} from './text-scan.mts';

const MODIFIERS = new Set(
  [
    'public private protected internal open final abstract sealed inner data value enum annotation',
    'override suspend inline operator infix tailrec external lateinit const expect actual companion',
  ]
    .join(' ')
    .split(' '),
);
const ANNOTATION_HEAD = /@(?:\w+\s*:\s*)?([\w.`]+)$/u;
const WORD_TAIL = /[\w`]+$/u;
const CLASS_KEYWORD = /(?<![\w.:`])(class|object|interface)\b(?!\s*[=)])/gu;
const NAME_HEAD = /\s*(`[^`]+`|[A-Za-z_]\w*)/u;
const SUPERTYPE_HEAD = /^\s*([\w.]+)/u;
const HEADER_MARKS = /[()[\]{}<>:\n]/gu;
const SPLIT_MARKS = /[([<{)\]>},]/gu;
const NEXT_ANGLE: Record<string, number | undefined> = { '<': 1, '>': -1 };
const MAX_ANNOTATION_TOKENS = 40;
const WINDOW = 160;

export function unquote(raw: string): string {
  return raw.replaceAll('`', '');
}

export function simpleName(qualified: string): string {
  return lastSegment(unquote(qualified)) ?? '';
}

function argumentsBefore(
  scanned: TestScanned,
  end: number,
): { open: number; args: string | undefined } {
  const tail = trimmedEnd(scanned, end);
  if (scanned.code[tail - 1] !== ')') {
    return { open: tail, args: undefined };
  }
  const open = matchingOpen(scanned, tail - 1);
  return { open, args: open < 0 ? undefined : scanned.source.slice(open + 1, tail - 1) };
}

function precedingToken(scanned: TestScanned, end: number): PrecedingToken | undefined {
  const { code } = scanned;
  const { open, args } = argumentsBefore(scanned, end);
  if (open < 0) {
    return undefined;
  }
  const head = trimmedEnd(scanned, open);
  const from = Math.max(0, head - WINDOW);
  const window = code.slice(from, head);
  const annotation = ANNOTATION_HEAD.exec(window);
  if (annotation !== null) {
    const start = from + annotation.index;
    return { start, name: simpleName(groupOf(annotation, 1)), args: args ?? '' };
  }
  const word = WORD_TAIL.exec(window)?.[0];
  return args === undefined && word !== undefined && MODIFIERS.has(word)
    ? { start: head - word.length, word }
    : undefined;
}

export function headerBefore(scanned: TestScanned, index: number): Header {
  const header: Header = { annotations: [], modifiers: new Set(), start: index };
  repeatUntil(MAX_ANNOTATION_TOKENS, () => {
    const token = precedingToken(scanned, header.start);
    if (token === undefined) {
      return true;
    }
    header.start = token.start;
    if ('name' in token) {
      header.annotations.unshift({ name: token.name, args: token.args, offset: token.start });
    } else {
      header.modifiers.add(token.word);
    }
    return false;
  });
  return header;
}

function continuesHeader(scanned: TestScanned, newline: number): boolean {
  const continues = '{,:'.includes(nextSignificant(scanned.code, newline + 1) ?? ' ');
  const hanging = ',:'.includes(previousSignificant(scanned, newline) ?? ' ');
  return continues || hanging;
}

function trackHeader(state: HeaderState, char: string, index: number): void {
  state.depth += '(['.includes(char) ? 1 : 0;
  state.depth -= ')]'.includes(char) ? 1 : 0;
  state.angle += state.depth === 0 ? (NEXT_ANGLE[char] ?? 0) : 0;
  if (char === ':' && state.depth === 0 && state.angle === 0 && state.colon < 0) {
    state.colon = index + 1;
  }
}

function headerEnd(scanned: TestScanned, from: number): HeaderEnd {
  const { code } = scanned;
  const state = { depth: 0, angle: 0, colon: -1 };
  for (const { index, 0: char } of marksFrom(code, HEADER_MARKS, from)) {
    if (state.depth === 0 && char === '{') {
      return { bodyOpen: index, end: index, colon: state.colon };
    }
    trackHeader(state, char, index);
    const flat = state.depth === 0 && state.angle === 0;
    if (char === '\n' && flat && !continuesHeader(scanned, index)) {
      return { bodyOpen: -1, end: index, colon: state.colon };
    }
  }
  return { bodyOpen: -1, end: code.length, colon: state.colon };
}

function splitTopLevel(code: string, from: number, to: number): number[][] {
  const parts: number[][] = [];
  const state = { depth: 0, start: from };
  for (const { index, 0: char } of marksFrom(code, SPLIT_MARKS, from)) {
    if (index >= to) {
      break;
    }
    state.depth += '([<{'.includes(char) ? 1 : 0;
    state.depth -= ')]>}'.includes(char) && code.slice(index - 1, index + 1) !== '->' ? 1 : 0;
    if (char === ',' && state.depth === 0) {
      parts.push([state.start, index]);
      state.start = index + 1;
    }
  }
  return [...parts, [state.start, to]];
}

function supertypesOf(code: string, header: HeaderEnd): SuperType[] {
  if (header.colon < 0) {
    return [];
  }
  return splitTopLevel(code, header.colon, header.end).flatMap(([from = 0, to = 0]) => {
    const head = SUPERTYPE_HEAD.exec(code.slice(from, to));
    const paren = code.slice(from, to).indexOf('(');
    return head === null
      ? []
      : [{ name: simpleName(groupOf(head, 1)), callOpen: paren < 0 ? -1 : from + paren }];
  });
}

function classAt(scanned: TestScanned, match: RegExpExecArray): ClassInfo[] {
  const { code, source } = scanned;
  const afterKeyword = match.index + match[0].length;
  const named = execAt(code, NAME_HEAD, afterKeyword);
  if (named === undefined && match[1] !== 'object') {
    return [];
  }
  const after = afterKeyword + (named === undefined ? 0 : named[0].length);
  const header = headerEnd(scanned, after);
  const bodyClose = header.bodyOpen < 0 ? -1 : closeOf(scanned, header.bodyOpen);
  const before = headerBefore(scanned, match.index);
  const nameStart = after - (named === undefined ? 0 : (named[1]?.length ?? 0));
  return [
    {
      kind: groupOf(match, 1),
      name: named === undefined ? 'object' : unquote(source.slice(nameStart, after)),
      offset: match.index,
      start: before.start,
      end: header.bodyOpen < 0 ? header.end : bodyClose + 1,
      annotations: before.annotations,
      modifiers: before.modifiers,
      supers: supertypesOf(code, header),
      bodyOpen: header.bodyOpen,
      bodyClose,
    },
  ];
}

export function classesOf(scanned: TestScanned): ClassInfo[] {
  return remembered(scanned, 'classes', () =>
    [...scanned.code.matchAll(CLASS_KEYWORD)].flatMap((match) => classAt(scanned, match)),
  );
}

export function enclosingClasses(classes: ClassInfo[], offset: number): ClassInfo[] {
  return classes
    .filter(({ bodyOpen, bodyClose }) => bodyOpen >= 0 && bodyOpen < offset && offset < bodyClose)
    .toSorted((left, right) => left.bodyOpen - right.bodyOpen);
}

export function chainName(classes: ClassInfo[], offset: number, last?: string): string {
  const outer = classes
    .filter((klass) => klass.offset < offset && offset < klass.end)
    .toSorted((left, right) => left.offset - right.offset);
  const names = [...outer.map(({ name }) => name), last];
  return names.filter((name) => name !== undefined).join('.') || 'top level';
}

export function ownersOf(
  classes: ClassInfo[],
  offsets: number[],
): Map<number, ClassInfo | undefined> {
  const events: OwnerEvent[] = [
    ...classes
      .filter(({ bodyOpen }) => bodyOpen >= 0)
      .map((klass) => ({ at: klass.bodyOpen, klass })),
    ...[...new Set(offsets)].map((offset) => ({ at: offset, offset })),
  ].toSorted((left, right) => left.at - right.at);
  const state: { stack: ClassInfo[] } = { stack: [] };
  const owners = new Map<number, ClassInfo | undefined>();
  for (const event of events) {
    state.stack = state.stack.filter(({ bodyClose }) => bodyClose > event.at);
    if (event.klass === undefined) {
      owners.set(event.offset, state.stack.at(-1));
    } else {
      state.stack.push(event.klass);
    }
  }
  return owners;
}
