import type { Span, TestScanned } from '../../typed/discovery-types.mts';
import { groupOf } from '../../typed/indexing.mts';
import type { ClockHit } from '../../typed/rule-types.mts';

type Local = { name: string; tail: number };
import { functionAround } from '../../global-state/state-restores.mts';
import { classesOf, enclosingClasses } from '../../discovery/declarations.mts';
import { closeOf, escapeRegExp, execAt, wordBefore } from '../../discovery/text-scan.mts';
import { enclosingParens } from '../report.mts';
import { isMarkerSpan } from './markers.mts';
import { isOperand } from './operands.mts';

const MEASURING_CALLS = new Set(['isBefore', 'isAfter', 'compareTo', 'until', 'while']);
const JAVA_TIME_BETWEEN = /(?:Duration|Period|ChronoUnit\s*\.\s*\w+)\s*\.\s*$/u;
const CHAIN_CALL = /\s*\??\.\s*(?:plus|minus|to)\w*\s*\(/uy;
const CHAIN_PROPERTY = /\s*\??\.\s*(?:epoch|nano)\w*\b(?!\s*\()/uy;
const MEASURING_RECEIVER = /\s*\??\.\s*(?:isBefore|isAfter|compareTo|until)\b/uy;
const LOCAL_BINDING = /(?<![\w.`])(?:val|var)\s+(\w+)\s*(?::[^=\n]+)?=\s*$/u;
const STATEMENT_END = /^[ \t]*(?:[;\n}]|$)/u;
const PLUS_STATEMENT = /^[ \t]*\+[^\n;{}]*(?:[;\n}]|$)/u;
const BEFORE_WINDOW = 80;
const MAX_CHAIN = 8;
const BETWEEN_WINDOW = 40;

function chainStep(scanned: TestScanned, end: number): number | undefined {
  const call = execAt(scanned.code, CHAIN_CALL, end);
  if (call !== undefined) {
    return closeOf(scanned, end + call[0].length - 1) + 1;
  }
  const property = execAt(scanned.code, CHAIN_PROPERTY, end);
  return property === undefined ? undefined : end + property[0].length;
}

function chainEnd(scanned: TestScanned, from: number): number {
  const ends = [from];
  for (const end of ends) {
    const next = chainStep(scanned, end);
    if (next !== undefined && ends.length < MAX_CHAIN) {
      ends.push(next);
    }
  }
  return ends.at(-1) ?? from;
}

function measuringCall(scanned: TestScanned, open: number): boolean {
  const { word, start } = wordBefore(scanned, open);
  if (word === 'between') {
    return JAVA_TIME_BETWEEN.test(scanned.code.slice(Math.max(0, start - BETWEEN_WINDOW), start));
  }
  return MEASURING_CALLS.has(word);
}

function inMeasuringCall(scanned: TestScanned, start: number): boolean {
  return enclosingParens(scanned.code, start).some((open) => measuringCall(scanned, open));
}

function isMeasuringSpan(scanned: TestScanned, start: number, end: number): boolean {
  const tail = chainEnd(scanned, end);
  return (
    isOperand(scanned, start, tail) ||
    execAt(scanned.code, MEASURING_RECEIVER, tail) !== undefined ||
    inMeasuringCall(scanned, start)
  );
}

function scopeOf(scanned: TestScanned, offset: number): Span {
  const fn = functionAround(scanned, offset);
  if (fn !== undefined) {
    return fn.body;
  }
  const klass = enclosingClasses(classesOf(scanned), offset).at(-1);
  return klass === undefined
    ? { start: 0, end: scanned.code.length }
    : { start: klass.bodyOpen, end: klass.bodyClose };
}

function localAfter(scanned: TestScanned, read: ClockHit): Local | undefined {
  const tail = chainEnd(scanned, read.end);
  const from = Math.max(0, read.offset - BEFORE_WINDOW);
  const binding = LOCAL_BINDING.exec(scanned.code.slice(from, read.offset));
  const rest = scanned.code.slice(tail, tail + BEFORE_WINDOW);
  const ends = STATEMENT_END.test(rest) || PLUS_STATEMENT.test(rest);
  return binding === null || !ends ? undefined : { name: groupOf(binding, 1), tail };
}

function usesOf(scanned: TestScanned, local: Local, scope: Span): number[] {
  const pattern = new RegExp(
    String.raw`(?<![\w.\x60])${escapeRegExp(local.name)}(?![\w\x60])`,
    'gu',
  );
  const text = scanned.contextCode.slice(local.tail, scope.end);
  return [...text.matchAll(pattern)].map((match) => local.tail + match.index);
}

function isTemplated(scanned: TestScanned, local: Local, scope: Span): boolean {
  const pattern = new RegExp(String.raw`\$(?:\{\s*)?${escapeRegExp(local.name)}(?!\w)`, 'u');
  return scanned.literals.some(
    (literal) =>
      literal.template &&
      literal.start >= local.tail &&
      literal.end <= scope.end &&
      pattern.test(literal.text),
  );
}

function isMeasuredLocal(
  scanned: TestScanned,
  read: ClockHit,
  accepts: (scanned: TestScanned, start: number, end: number) => boolean,
): boolean {
  const local = localAfter(scanned, read);
  if (local === undefined) {
    return false;
  }
  const scope = scopeOf(scanned, read.offset);
  const uses = usesOf(scanned, local, scope);
  return (
    !isTemplated(scanned, local, scope) &&
    uses.length > 0 &&
    uses.every((offset) => accepts(scanned, offset, offset + local.name.length))
  );
}

function isMeasuringOrMarker(scanned: TestScanned, start: number, end: number): boolean {
  return isMeasuringSpan(scanned, start, end) || isMarkerSpan(scanned, start, end);
}

export function isMeasuring(scanned: TestScanned, read: ClockHit): boolean {
  if (isMeasuringSpan(scanned, read.offset, read.end)) {
    return true;
  }
  const instant = read.family === 'Instant.now';
  return (
    (instant && isMarkerSpan(scanned, read.offset, read.end)) ||
    isMeasuredLocal(scanned, read, instant ? isMeasuringOrMarker : isMeasuringSpan)
  );
}
