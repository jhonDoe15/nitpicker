import { isPlainObject } from '../../../../../shared/config.mjs';

export const MAX_COLUMN = Number.MAX_SAFE_INTEGER;

function integerOrNull(value) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

export function finiteNumberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function lineNumberOf(value) {
  const parsed = integerOrNull(value);
  return parsed !== null && parsed >= 1 ? parsed : null;
}

function columnNumberOf(value) {
  if (value === null || value === undefined) {
    return MAX_COLUMN;
  }
  const parsed = integerOrNull(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

export function comparePosition(leftLine, leftColumn, rightLine, rightColumn) {
  return leftLine === rightLine ? leftColumn - rightColumn : leftLine - rightLine;
}

export function parsePosition(value) {
  if (!isPlainObject(value)) {
    return null;
  }
  const line = lineNumberOf(value.line);
  const column = columnNumberOf(value.column);
  return line === null || column === null ? null : { line, column };
}

export function parseSpan(value) {
  if (!isPlainObject(value)) {
    return null;
  }
  const start = parsePosition(value.start);
  const end = parsePosition(value.end);
  if (start === null || end === null) {
    return null;
  }
  if (comparePosition(start.line, start.column, end.line, end.column) > 0) {
    return null;
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
  return line === null
    ? null
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
    comparePosition(
      container.startLine,
      container.startColumn,
      candidate.startLine,
      candidate.startColumn,
    ) <= 0 &&
    comparePosition(
      candidate.endLine,
      candidate.endColumn,
      container.endLine,
      container.endColumn,
    ) <= 0
  );
}

export function spanContainsPosition(span, line, column) {
  return (
    comparePosition(span.startLine, span.startColumn, line, column) <= 0 &&
    comparePosition(line, column, span.endLine, span.endColumn) < 0
  );
}

export function spansShareBoundaryLines(left, right) {
  return left.startLine === right.startLine && left.endLine === right.endLine;
}

export function spansOverlap(left, right) {
  return (
    comparePosition(left.startLine, left.startColumn, right.endLine, right.endColumn) < 0 &&
    comparePosition(right.startLine, right.startColumn, left.endLine, left.endColumn) < 0
  );
}
