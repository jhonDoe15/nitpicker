import { groupOf } from '../typed/indexing.mts';
import type {
  ClassInfo,
  FunctionBody,
  FunctionInfo,
  TestScanned,
} from '../typed/discovery-types.mts';
import { classesOf, headerBefore, ownersOf, simpleName, unquote } from './declarations.mts';
import {
  closeOf,
  execAt,
  lineEndOf,
  lineStartOf,
  marksFrom,
  nextSignificant,
  remembered,
  skipSpace,
} from './text-scan.mts';

const FUNCTION_KEYWORD = /(?<![\w.`])fun[ \t]([^(){}=\n]*)\(/gu;
const FUNCTION_NAME = /(`[^`]+`|[A-Za-z_]\w*)$/u;
const CONTINUATION_START = /^\s*(?:\.|\?[.:]|&&|\|\|)/u;
const BRACKET_OPEN = /[({[]/gu;
const BRACKET_CLOSE = /[)}\]]/gu;
const BODY_MARKS = /[{=([<)\]>\n]/gu;

function bracketBalance(line: string): number {
  return (line.match(BRACKET_OPEN)?.length ?? 0) - (line.match(BRACKET_CLOSE)?.length ?? 0);
}

function expressionEnd(code: string, start: number, indent: number): number {
  const state = { depth: bracketBalance(code.slice(start, lineEndOf(code, start))) };
  for (const { index } of marksFrom(code, /\n/gu, start)) {
    const line = code.slice(index + 1, lineEndOf(code, index + 1));
    const indented = line.trim() === '' || line.search(/\S/u) > indent;
    if (state.depth <= 0 && !indented && !CONTINUATION_START.test(line)) {
      return index;
    }
    state.depth += bracketBalance(line);
  }
  return code.length;
}

function bodyStart(code: string, from: number): number {
  const state = { depth: 0 };
  for (const { index, 0: char } of marksFrom(code, BODY_MARKS, from)) {
    const arrowTail = char === '>' && code[index - 1] === '-';
    if (state.depth === 0 && (char === '{' || char === '=')) {
      return index;
    }
    state.depth += '([<'.includes(char) ? 1 : 0;
    state.depth -= ')]>'.includes(char) && !arrowTail ? 1 : 0;
    const next = nextSignificant(code, index + 1) ?? ' ';
    if (char === '\n' && state.depth <= 0 && !'{=:'.includes(next)) {
      return -1;
    }
  }
  return -1;
}

function functionBody(
  scanned: TestScanned,
  signatureEnd: number,
  indent: number,
): FunctionBody | undefined {
  const { code } = scanned;
  const colon = execAt(code, /\s*:/u, signatureEnd);
  const mark =
    colon === undefined
      ? skipSpace(code, signatureEnd)
      : bodyStart(code, signatureEnd + colon[0].length);
  const returns =
    colon === undefined || mark < 0 ? '' : code.slice(signatureEnd + colon[0].length, mark).trim();
  if (code[mark] === '{') {
    return { start: mark + 1, end: closeOf(scanned, mark), expression: false, returns };
  }
  return code[mark] === '='
    ? { start: mark + 1, end: expressionEnd(code, mark + 1, indent), expression: true, returns }
    : undefined;
}

function receiverOf(head: string, nameIndex: number): string {
  const text = head
    .slice(0, nameIndex)
    .replace(/^\s*<[^>]*>\s*/u, '')
    .replace(/\.\s*$/u, '');
  return text.trim() === '' ? '' : simpleName(text.replace(/<.*$/u, '').trim());
}

function functionAt(scanned: TestScanned, match: RegExpExecArray): FunctionInfo[] {
  const { code, source } = scanned;
  const head = groupOf(match, 1).trimEnd();
  const found = FUNCTION_NAME.exec(head);
  const open = match.index + match[0].length - 1;
  const indent = execAt(code, /[ \t]*/u, lineStartOf(code, match.index))?.[0].length ?? 0;
  const body = functionBody(scanned, closeOf(scanned, open) + 1, indent);
  if (found === null || body === undefined) {
    return [];
  }
  const nameStart = open - groupOf(match, 1).length + found.index;
  const before = headerBefore(scanned, match.index);
  return [
    {
      name: unquote(source.slice(nameStart, nameStart + groupOf(found, 1).length)),
      receiver: receiverOf(head, found.index),
      offset: match.index,
      start: before.start,
      annotations: before.annotations,
      modifiers: before.modifiers,
      body,
    },
  ];
}

export function functionsOf(scanned: TestScanned): FunctionInfo[] {
  return remembered(scanned, 'functions', () =>
    [...scanned.code.matchAll(FUNCTION_KEYWORD)].flatMap((match) => functionAt(scanned, match)),
  );
}

export function functionOwners(scanned: TestScanned): Map<number, ClassInfo | undefined> {
  return remembered(scanned, 'function-owners', () =>
    ownersOf(
      classesOf(scanned),
      functionsOf(scanned).map(({ offset }) => offset),
    ),
  );
}
