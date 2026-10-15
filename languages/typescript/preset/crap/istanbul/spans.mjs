import { isPlainObject } from '../../../../../shared/config.mjs';

export const MAX_COLUMN = Number.MAX_SAFE_INTEGER;

function integerOf(value) {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

export function finiteNumberOf(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function lineNumberOf(value) {
  const parsed = integerOf(value);
  return parsed !== undefined && parsed >= 1 ? parsed : undefined;
}

function columnNumberOf(value) {
  const parsed = integerOf(value ?? MAX_COLUMN);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

export function spanStart(span) {
  return { line: span.startLine, column: span.startColumn };
}

export function spanEnd(span) {
  return { line: span.endLine, column: span.endColumn };
}

export function comparePosition(left, right) {
  return left.line === right.line ? left.column - right.column : left.line - right.line;
}

export function parsePosition(value) {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const line = lineNumberOf(value.line);
  const column = columnNumberOf(value.column);
  return line === undefined || column === undefined ? undefined : { line, column };
}

export function parseSpan(value) {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const start = parsePosition(value.start);
  const end = parsePosition(value.end);
  if (start === undefined || end === undefined || comparePosition(start, end) > 0) {
    return undefined;
  }
  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
}

export function parseLineSpan(value) {
  const line = lineNumberOf(value);
  return line === undefined
    ? undefined
    : { startLine: line, startColumn: 0, endLine: line, endColumn: MAX_COLUMN };
}

export function spanKey(span) {
  return [span.startLine, span.startColumn, span.endLine, span.endColumn].join(':');
}

export function spansEqual(left, right) {
  return spanKey(left) === spanKey(right);
}

export function spanContains(container, candidate) {
  return (
    comparePosition(spanStart(container), spanStart(candidate)) <= 0 &&
    comparePosition(spanEnd(candidate), spanEnd(container)) <= 0
  );
}

export function spanContainsPosition(span, line, column) {
  const position = { line, column };
  return (
    comparePosition(spanStart(span), position) <= 0 && comparePosition(position, spanEnd(span)) < 0
  );
}

export function spansShareBoundaryLines(left, right) {
  return left.startLine === right.startLine && left.endLine === right.endLine;
}

export function spansOverlap(left, right) {
  return (
    comparePosition(spanStart(left), spanEnd(right)) < 0 &&
    comparePosition(spanStart(right), spanEnd(left)) < 0
  );
}
