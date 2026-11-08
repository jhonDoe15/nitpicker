import { functionAround } from '../../global-state/state-restores.mjs';
import { classesOf, enclosingClasses } from '../../discovery/declarations.mjs';
import { closeOf, execAt, wordBefore } from '../../discovery/text-scan.mjs';
import { enclosingParens } from '../report.mjs';
import { isOperand } from './operands.mjs';

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

function chainStep(scanned, end) {
  const call = execAt(scanned.code, CHAIN_CALL, end);
  if (call !== null) {
    return closeOf(scanned, end + call[0].length - 1) + 1;
  }
  const property = execAt(scanned.code, CHAIN_PROPERTY, end);
  return property === null ? undefined : end + property[0].length;
}

function chainEnd(scanned, from) {
  const ends = [from];
  for (const end of ends) {
    const next = chainStep(scanned, end);
    if (next !== undefined && ends.length < MAX_CHAIN) {
      ends.push(next);
    }
  }
  return ends.at(-1);
}

function measuringCall(scanned, open) {
  const { word, start } = wordBefore(scanned, open);
  if (word === 'between') {
    return JAVA_TIME_BETWEEN.test(scanned.code.slice(Math.max(0, start - BETWEEN_WINDOW), start));
  }
  return MEASURING_CALLS.has(word);
}

function inMeasuringCall(scanned, start) {
  return enclosingParens(scanned.code, start).some((open) => measuringCall(scanned, open));
}

function isMeasuringSpan(scanned, start, end) {
  const tail = chainEnd(scanned, end);
  return (
    isOperand(scanned, start, tail) ||
    execAt(scanned.code, MEASURING_RECEIVER, tail) !== null ||
    inMeasuringCall(scanned, start)
  );
}

function scopeOf(scanned, offset) {
  const fn = functionAround(scanned, offset);
  if (fn !== undefined) {
    return fn.body;
  }
  const klass = enclosingClasses(classesOf(scanned), offset).at(-1);
  return klass === undefined
    ? { start: 0, end: scanned.code.length }
    : { start: klass.bodyOpen, end: klass.bodyClose };
}

function localAfter(scanned, read) {
  const tail = chainEnd(scanned, read.end);
  const from = Math.max(0, read.offset - BEFORE_WINDOW);
  const binding = LOCAL_BINDING.exec(scanned.code.slice(from, read.offset));
  const rest = scanned.code.slice(tail, tail + BEFORE_WINDOW);
  const ends = STATEMENT_END.test(rest) || PLUS_STATEMENT.test(rest);
  return binding === null || !ends ? undefined : { name: binding[1], tail };
}

function usesOf(scanned, local, scope) {
  const pattern = new RegExp(String.raw`(?<![\w.\x60])${local.name}(?![\w\x60])`, 'gu');
  const text = scanned.contextCode.slice(local.tail, scope.end);
  return [...text.matchAll(pattern)].map((match) => local.tail + match.index);
}

function isTemplated(scanned, local, scope) {
  const pattern = new RegExp(String.raw`\$(?:\{\s*)?${local.name}(?!\w)`, 'u');
  return scanned.literals.some(
    (literal) =>
      literal.template &&
      literal.start >= local.tail &&
      literal.end <= scope.end &&
      pattern.test(literal.text),
  );
}

function isMeasuredLocal(scanned, read) {
  const local = localAfter(scanned, read);
  if (local === undefined) {
    return false;
  }
  const scope = scopeOf(scanned, read.offset);
  const uses = usesOf(scanned, local, scope);
  return (
    !isTemplated(scanned, local, scope) &&
    uses.length > 0 &&
    uses.every((offset) => isMeasuringSpan(scanned, offset, offset + local.name.length))
  );
}

export function isMeasuring(scanned, read) {
  return isMeasuringSpan(scanned, read.offset, read.end) || isMeasuredLocal(scanned, read);
}
