import {
  DYNAMIC,
  FRAGMENT_BEFORE_VALUE,
  LOOSE_STATEMENT,
  STRONG_STATEMENT,
} from '../../../../../../shared/rules/security/sql-text.mjs';
import { closingIndex, literalAt, splitArguments } from '../kotlin-source.mjs';
import { classifiedPieces, templatePieces } from './sql-values.mjs';

const SINK_NAMES = [
  String.raw`query\w*`,
  String.raw`execute\w*`,
  'exec',
  'prepareStatement',
  'prepareCall',
  'createQuery',
  'createNativeQuery',
  'createSQLQuery',
  'nativeQuery',
  'rawQuery',
  'execSQL',
  'addBatch',
  'batchUpdate',
  'sql',
];
const SQL_SINK = new RegExp(`^(?:${SINK_NAMES.join('|')})$`);
const UPDATE_RECEIVER = /jdbc|template|statement/i;
const CALL_BEFORE = /(?:([A-Za-z_]\w*)\s*\??\.\s*)?([A-Za-z_]\w*)\s*(?:<[^<>()]*>\s*)?\($/;
const ASSIGNED_BEFORE = /\b(?:val|var)\s+([A-Za-z_]\w*)\s*(?::\s*String\s*)?=\s*$/;
const PLUS_AFTER = /^\s*\+(?![+=])\s*/;
const PLUS_BEFORE = /(?<![+=])\+\s*$/;
const NAME_BEFORE = /([A-Za-z_][\w.]*)\s*(?<![+=])\+\s*$/;
const PRIMARY = /^[A-Za-z_]\w*(?:\s*(?:\?\.|\.)\s*[A-Za-z_]\w*|!!)*/;
const FORMAT_CALL = /\bString\s*\.\s*format\s*\(/g;
const FORMAT_AFTER = /^\s*\.\s*format\s*\(/;
const CONVERSION = /%(?:\d+\$)?[-#+ 0,(]*(?:[1-9]\d*)?(?:\.\d+)?([a-zA-Z%])/g;
const PARENS = /[()]/g;

export const SQL_MESSAGES = {
  SqlStringBuilding:
    'Pass values as bind parameters: `jdbcTemplate.query("SELECT * FROM users WHERE id = ?", mapper, id)`, `prepareStatement("... WHERE id = ?")` with `setLong(1, id)`, `:id` with `NamedParameterJdbcTemplate` or JPA `setParameter("id", id)`, or a query DSL (Exposed, jOOQ). Build placeholder lists from placeholders alone (`ids.joinToString(", ") { "?" }`), optional filters from literal fragments joined with `" AND "`, and take a table or column name from a constant or an enum. This SQL text is built from a runtime value with a string template, `+` or `format`, so the value can change the statement (SQL injection).',
};

function enclosingParen(code, offset) {
  const open = [];
  for (const { index, 0: paren } of code.slice(0, offset).matchAll(PARENS)) {
    if (paren === '(') {
      open.push(index);
    } else {
      open.pop();
    }
  }
  return open.at(-1) ?? -1;
}

function isSinkCall(receiver, name) {
  return SQL_SINK.test(name) || (name === 'update' && UPDATE_RECEIVER.test(receiver ?? ''));
}

function callSink(code, offset) {
  const open = enclosingParen(code, offset);
  if (open === -1) {
    return false;
  }
  const call = CALL_BEFORE.exec(code.slice(0, open + 1));
  return call !== null && isSinkCall(call[1], call[2]);
}

function variableSink(code, name) {
  const passed = new RegExp(String.raw`(?<![\w.])${name}\b`, 'g');
  return [...code.matchAll(passed)].some(({ index }) => {
    const open = enclosingParen(code, index);
    if (open === -1) {
      return false;
    }
    const call = CALL_BEFORE.exec(code.slice(0, open + 1));
    const { parts } = splitArguments(code, open);
    const isArgument = parts.some((part) => code.slice(part.start, part.end).trim() === name);
    return call !== null && isArgument && isSinkCall(call[1], call[2]);
  });
}

function sinkOf(scanned, start) {
  const assigned = ASSIGNED_BEFORE.exec(scanned.code.slice(0, start));
  return (
    callSink(scanned.code, start) || (assigned !== null && variableSink(scanned.code, assigned[1]))
  );
}

function looksLikeSql(pieces, sink) {
  const text = pieces.map((piece) => piece.text ?? DYNAMIC).join('');
  const prefixes = pieces.flatMap((piece, index) =>
    piece.runtime === true
      ? [
          pieces
            .slice(0, index)
            .map((part) => part.text ?? DYNAMIC)
            .join(''),
        ]
      : [],
  );
  return (
    STRONG_STATEMENT.test(text) ||
    (sink &&
      (LOOSE_STATEMENT.test(text) || prefixes.some((before) => FRAGMENT_BEFORE_VALUE.test(before))))
  );
}

function segment(code, from) {
  const name = PRIMARY.exec(code.slice(from));
  if (name === null) {
    return { end: from };
  }
  const end = from + name[0].length;
  const call = /^\s*[([]/.exec(code.slice(end));
  if (call === null) {
    return { end };
  }
  const close = closingIndex(code, end + call[0].length - 1) + 1;
  const member = /^\s*\??\.\s*/.exec(code.slice(close));
  return member === null ? { end: close } : { end: close, next: close + member[0].length };
}

function primaryEnd(code, at) {
  const segments = [segment(code, at)];
  for (const { next } of segments) {
    if (next !== undefined) {
      segments.push(segment(code, next));
    }
  }
  return segments.at(-1).end;
}

function nextOperand(scanned, end) {
  const plus = PLUS_AFTER.exec(scanned.code.slice(end));
  if (plus === null) {
    return undefined;
  }
  const at = end + plus[0].length;
  const literal = literalAt(scanned, at);
  if (literal !== undefined) {
    return { operand: { literal }, end: literal.end };
  }
  const operandEnd = primaryEnd(scanned.code, at);
  const expression = scanned.source.slice(at, operandEnd).trim();
  return operandEnd === at ? undefined : { operand: { expression }, end: operandEnd };
}

function operandsAfter(scanned, start, first) {
  const steps = [{ operand: first, end: start }];
  for (const { end } of steps) {
    const next = nextOperand(scanned, end);
    if (next !== undefined) {
      steps.push(next);
    }
  }
  return { end: steps.at(-1).end, operands: steps.map(({ operand }) => operand) };
}

function literalPieces(literal) {
  return literal.template ? templatePieces(literal) : [{ text: literal.text }];
}

function concatenation(scanned, literal) {
  const before = scanned.code.slice(0, literal.start);
  if (
    PLUS_BEFORE.test(before) &&
    scanned.literals.some(({ end }) => before.trimEnd().slice(0, -1).trimEnd().length === end)
  ) {
    return undefined;
  }
  const { end, operands } = operandsAfter(scanned, literal.end, { literal });
  const leading = NAME_BEFORE.exec(before);
  const lead = PLUS_BEFORE.test(before) ? [{ expression: leading?.[1] ?? '()' }] : [];
  if (operands.length === 1 && lead.length === 0) {
    return literal.template
      ? { start: literal.start, end, pieces: literalPieces(literal) }
      : undefined;
  }
  const pieces = [...lead, ...operands].flatMap((operand) =>
    operand.literal === undefined ? [operand] : literalPieces(operand.literal),
  );
  return { start: lead.length === 0 ? literal.start : before.lastIndexOf('+'), end, pieces };
}

function formatPieces(scanned, literal, parts) {
  const values = parts.map((part) => scanned.source.slice(part.start, part.end).trim());
  const pieces = [];
  let cursor = 0;
  let next = 0;
  for (const { index, 0: conversion, 1: kind } of literal.text.matchAll(CONVERSION)) {
    pieces.push({ text: literal.text.slice(cursor, index) });
    cursor = index + conversion.length;
    if (kind === '%' || kind === 'n') {
      pieces.push({ text: kind === '%' ? '%' : '\n' });
    } else {
      pieces.push(kind === 's' ? { expression: values[next] ?? '()' } : { text: DYNAMIC });
      next += 1;
    }
  }
  pieces.push({ text: literal.text.slice(cursor) });
  return pieces;
}

function literalOf(scanned, part) {
  const text = scanned.code.slice(part.start, part.end);
  return literalAt(scanned, part.start + text.length - text.trimStart().length);
}

function formatCalls(scanned) {
  const direct = [...scanned.code.matchAll(FORMAT_CALL)].flatMap((match) => {
    const { parts } = splitArguments(scanned.code, match.index + match[0].length - 1);
    const formatAt = parts.findIndex((part) => literalOf(scanned, part) !== undefined);
    if (formatAt === -1) {
      return [];
    }
    const literal = literalOf(scanned, parts[formatAt]);
    const pieces = formatPieces(scanned, literal, parts.slice(formatAt + 1));
    return [{ start: match.index, end: parts[formatAt].end, pieces }];
  });
  const extension = scanned.literals.flatMap((literal) => {
    const call = FORMAT_AFTER.exec(scanned.code.slice(literal.end));
    if (call === null || literal.template) {
      return [];
    }
    const { parts } = splitArguments(scanned.code, literal.end + call[0].length - 1);
    return [
      { start: literal.start, end: literal.end, pieces: formatPieces(scanned, literal, parts) },
    ];
  });
  return [...direct, ...extension];
}

function isNested(scanned, literal) {
  return scanned.literals.some(
    (outer) => outer !== literal && outer.bodyStart <= literal.start && literal.end <= outer.end,
  );
}

export function sqlStringBuilding(scanned, context) {
  const composed = [
    ...scanned.literals
      .filter((literal) => !isNested(scanned, literal))
      .map((literal) => concatenation(scanned, literal))
      .filter((candidate) => candidate !== undefined),
    ...formatCalls(scanned),
  ];
  const reported = [];
  for (const candidate of composed.toSorted((left, right) => left.start - right.start)) {
    const covered = reported.some(
      ({ start, end }) => start <= candidate.start && candidate.end <= end,
    );
    const pieces = classifiedPieces(candidate.pieces, scanned, context);
    if (
      !covered &&
      pieces.some((piece) => piece.runtime === true) &&
      looksLikeSql(pieces, sinkOf(scanned, candidate.start))
    ) {
      reported.push(candidate);
    }
  }
  return reported.map(({ start }) => ({ rule: 'SqlStringBuilding', offset: start }));
}
