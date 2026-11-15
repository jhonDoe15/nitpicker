import type { Fields, FunctionEntry, ResolvedSpan, Span } from '../crap-types.mts';
import {
  comparePosition,
  isPlainObject,
  parseLineSpan,
  parsePosition,
  parseSpan,
  spanEnd,
  spanKey,
  spanStart,
} from './spans.mts';

const SPAN_SOURCE_RANK: Readonly<Record<string, number>> = { loc: 0, decl: 1, line: 2 };
const UNRANKED_SPAN_SOURCE = 3;

function resolvedSpan(entry: Fields): ResolvedSpan | undefined {
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

function functionEntryOf(value: unknown): FunctionEntry | undefined {
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

function identityKey(entry: FunctionEntry): string {
  if (entry.name && entry.declarationStart) {
    return `decl:${entry.name}:${String(entry.declarationStart.line)}:${String(entry.declarationStart.column)}`;
  }
  return entry.name
    ? `named-span:${entry.name}:${spanKey(entry.span)}`
    : `span:${spanKey(entry.span)}`;
}

function lineCount(span: Span): number {
  return span.endLine - span.startLine;
}

function rankOf(entry: FunctionEntry): number {
  return SPAN_SOURCE_RANK[entry.spanSource] ?? UNRANKED_SPAN_SOURCE;
}

function compareSpecificity(left: FunctionEntry, right: FunctionEntry): number {
  return (
    rankOf(left) - rankOf(right) ||
    lineCount(left.span) - lineCount(right.span) ||
    comparePosition(spanStart(right.span), spanStart(left.span)) ||
    comparePosition(spanEnd(left.span), spanEnd(right.span))
  );
}

function canonicalOf(entries: readonly FunctionEntry[]): FunctionEntry | undefined {
  const bySpan = new Map<string, FunctionEntry>();
  for (const entry of entries) {
    const key = spanKey(entry.span);
    const existing = bySpan.get(key);
    if (!existing || compareSpecificity(entry, existing) < 0) {
      bySpan.set(key, entry);
    }
  }
  return [...bySpan.values()].sort(compareSpecificity)[0];
}

export function deduplicateFunctions(entries: readonly FunctionEntry[]): FunctionEntry[] {
  const grouped = new Map<string, FunctionEntry[]>();
  for (const entry of entries) {
    const key = identityKey(entry);
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }
  return [...grouped.values()].map(canonicalOf).filter((entry) => entry !== undefined);
}

export function parseFunctions(functionMap: unknown): FunctionEntry[] {
  if (!isPlainObject(functionMap)) {
    return [];
  }
  return deduplicateFunctions(
    Object.values(functionMap)
      .map(functionEntryOf)
      .filter((entry) => entry !== undefined),
  );
}
