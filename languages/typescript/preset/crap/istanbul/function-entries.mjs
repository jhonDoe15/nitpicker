import { isPlainObject } from '../../../../../shared/config.mjs';
import {
  comparePosition,
  parseLineSpan,
  parsePosition,
  parseSpan,
  spanEnd,
  spanKey,
  spanStart,
} from './spans.mjs';

const SPAN_SOURCE_RANK = { loc: 0, decl: 1, line: 2 };
const UNRANKED_SPAN_SOURCE = 3;

function resolvedSpan(entry) {
  const loc = parseSpan(entry.loc);
  if (loc) {
    return { span: loc, spanSource: 'loc' };
  }
  const decl = parseSpan(entry.decl);
  if (decl) {
    return { span: decl, spanSource: 'decl' };
  }
  const line = parseLineSpan(entry.line);
  return line ? { span: line, spanSource: 'line' } : undefined;
}

function functionEntryOf(value) {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const resolved = resolvedSpan(value);
  if (!resolved) {
    return undefined;
  }
  const declarationStart = isPlainObject(value.decl) ? parsePosition(value.decl.start) : undefined;
  return {
    ...resolved,
    ...(typeof value.name === 'string' && value.name ? { name: value.name } : {}),
    ...(declarationStart ? { declarationStart } : {}),
  };
}

function identityKey(entry) {
  if (entry.name && entry.declarationStart) {
    return `decl:${entry.name}:${entry.declarationStart.line}:${entry.declarationStart.column}`;
  }
  return entry.name
    ? `named-span:${entry.name}:${spanKey(entry.span)}`
    : `span:${spanKey(entry.span)}`;
}

function lineCount(span) {
  return span.endLine - span.startLine;
}

function rankOf(entry) {
  return SPAN_SOURCE_RANK[entry.spanSource] ?? UNRANKED_SPAN_SOURCE;
}

function compareSpecificity(left, right) {
  return (
    rankOf(left) - rankOf(right) ||
    lineCount(left.span) - lineCount(right.span) ||
    comparePosition(spanStart(right.span), spanStart(left.span)) ||
    comparePosition(spanEnd(left.span), spanEnd(right.span))
  );
}

function canonicalOf(entries) {
  const bySpan = new Map();
  for (const entry of entries) {
    const key = spanKey(entry.span);
    const existing = bySpan.get(key);
    if (!existing || compareSpecificity(entry, existing) < 0) {
      bySpan.set(key, entry);
    }
  }
  return [...bySpan.values()].sort(compareSpecificity)[0];
}

export function deduplicateFunctions(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    const key = identityKey(entry);
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }
  return [...grouped.values()].map(canonicalOf);
}

export function parseFunctions(functionMap) {
  if (!isPlainObject(functionMap)) {
    return [];
  }
  return deduplicateFunctions(Object.values(functionMap).map(functionEntryOf).filter(Boolean));
}
