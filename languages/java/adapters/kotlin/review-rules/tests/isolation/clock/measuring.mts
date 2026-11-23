import type { Span, TestScanned } from '../../typed/discovery-types.mts';
import { groupOf } from '../../typed/indexing.mts';
import type { ClockHit } from '../../typed/rule-types.mts';

type Local = { name: string; tail: number };
import { functionAround } from '../../global-state/state-restores.mts';
import { classesOf, enclosingClasses } from '../../discovery/declarations.mts';
import {
  closeOf,
  escapeRegExp,
  execAt,
  nextSignificant,
  trimmedEnd,
  wordBefore,
} from '../../discovery/text-scan.mts';
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
const TIME_UNIT_CONVERSIONS = new Set([
  'toNanos',
  'toMicros',
  'toMillis',
  'toSeconds',
  'toMinutes',
  'toHours',
  'toDays',
  'convert',
]);
const QUALIFIED_TIME_UNIT =
  /(?:java\s*\.\s*util\s*\.\s*concurrent\s*\.\s*)?TimeUnit\s*\.\s*\w+\s*\.\s*$/u;
const BARE_TIME_UNIT =
  /(?:NANOSECONDS|MICROSECONDS|MILLISECONDS|SECONDS|MINUTES|HOURS|DAYS)\s*\.\s*$/u;
const BEFORE_WINDOW = 80;
const MAX_CHAIN = 8;
const BETWEEN_WINDOW = 40;
const TIME_UNIT_WINDOW = 80;

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

function conversionStep(scanned: TestScanned, span: Span): Span | undefined {
  const stop = trimmedEnd(scanned, span.start);
  if (scanned.code[stop - 1] !== '(') {
    return undefined;
  }
  const open = stop - 1;
  const { word, start: wordStart } = wordBefore(scanned, open);
  if (!TIME_UNIT_CONVERSIONS.has(word)) {
    return undefined;
  }
  const after = nextSignificant(scanned.code, span.end);
  if (after !== ')' && !(word === 'convert' && after === ',')) {
    return undefined;
  }
  const from = Math.max(0, wordStart - TIME_UNIT_WINDOW);
  const slice = scanned.code.slice(from, wordStart);
  const receiver = QUALIFIED_TIME_UNIT.exec(slice) ?? BARE_TIME_UNIT.exec(slice);
  return receiver === null
    ? undefined
    : { start: from + receiver.index, end: closeOf(scanned, open) + 1 };
}

function outerSpan(scanned: TestScanned, start: number, end: number): Span {
  const chained = { start, end: chainEnd(scanned, end) };
  const converted = conversionStep(scanned, chained);
  return converted === undefined
    ? chained
    : { start: converted.start, end: chainEnd(scanned, converted.end) };
}

function isMeasuringSpan(scanned: TestScanned, start: number, end: number): boolean {
  const span = outerSpan(scanned, start, end);
  return (
    isOperand(scanned, span.start, span.end) ||
    execAt(scanned.code, MEASURING_RECEIVER, span.end) !== undefined ||
    inMeasuringCall(scanned, span.start)
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
  const span = outerSpan(scanned, read.offset, read.end);
  const from = Math.max(0, span.start - BEFORE_WINDOW);
  const binding = LOCAL_BINDING.exec(scanned.code.slice(from, span.start));
  const rest = scanned.code.slice(span.end, span.end + BEFORE_WINDOW);
  const ends = STATEMENT_END.test(rest) || PLUS_STATEMENT.test(rest);
  return binding === null || !ends ? undefined : { name: groupOf(binding, 1), tail: span.end };
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
