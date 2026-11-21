import { withoutAnsi } from './terminal/terminal-text.mts';
import { appendAll } from '../lists/lists.mts';
import { fieldOf } from '../values/readers.mts';

const MAX_CAUSE_DEPTH = 3;
const MAX_CAUSE_LINES = 10;

function messageOf(error: unknown): string {
  const message = fieldOf(error, 'message');
  if (typeof message === 'string') {
    return message;
  }
  return String(error);
}

function firstLine(text: string): string {
  return (text.trim().split('\n', 1)[0] ?? '').trim();
}

function innerErrors(error: unknown): unknown[] {
  if (!(error instanceof Error)) {
    return [];
  }
  const aggregated: unknown[] = error instanceof AggregateError ? error.errors : [];
  return error.cause === undefined || error.cause === null
    ? aggregated
    : [...aggregated, error.cause];
}

export function firstErrorLine(error: unknown): string {
  return firstLine(messageOf(error));
}

function causeLines(error: unknown, message: string): string[] {
  const shown = [message];
  const pending = innerErrors(error).map((inner) => ({ inner, depth: 1 }));
  for (const { inner, depth } of pending) {
    const line = firstErrorLine(inner);
    if (line.length > 0 && !shown.some((text: string) => text.includes(line))) {
      shown.push(line);
    }
    if (depth < MAX_CAUSE_DEPTH) {
      appendAll(
        pending,
        innerErrors(inner).map((next) => ({ inner: next, depth: depth + 1 })),
      );
    }
  }
  const causes = shown.slice(1);
  const lines = causes.slice(0, MAX_CAUSE_LINES).map((line) => `  caused by: ${line}`);
  const hidden = causes.length - lines.length;
  return hidden > 0 ? [...lines, `  ... and ${String(hidden)} more causes`] : lines;
}

export function describeError(error: unknown): string {
  const message = messageOf(error);
  const lines = [message, ...causeLines(error, message)].filter((part) => part.length > 0);
  return withoutAnsi(lines.join('\n'));
}
