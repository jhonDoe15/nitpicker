import { linesOf as untypedLinesOf } from '../../../../../core/fix/common/rewrite/line-hunks.mjs';
import type { Hunk, HunkLine } from './unified-diff.mts';

export type HunkEdit = {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly line: number;
};
type Core = { readonly head: number; readonly changed: readonly HunkLine[]; readonly span: number };
type Replacement = {
  readonly lines: readonly string[];
  readonly changed: readonly HunkLine[];
  readonly from: number;
  readonly to: number;
  readonly eol: string;
};

const linesOf: (text: string) => string[] = untypedLinesOf;

const CARRIAGE_RETURN = /\r$/u;
const LINE_END = /\r?\n$/u;

function bare(line: string): string {
  return line.replace(LINE_END, '').replace(CARRIAGE_RETURN, '');
}

export function hunkLines(hunk: Hunk): {
  readonly before: string[];
  readonly after: string[];
} {
  return {
    before: hunk.lines.filter(({ kind }) => kind !== '+').map(({ text }) => bare(text)),
    after: hunk.lines.filter(({ kind }) => kind !== '-').map(({ text }) => bare(text)),
  };
}

function matchesAt(lines: readonly string[], start: number, before: readonly string[]): boolean {
  return (
    start >= 0 &&
    start + before.length <= lines.length &&
    before.every((line, offset) => bare(lines[start + offset] ?? '') === line)
  );
}

function withoutPastEnd(lines: readonly string[], before: string[], start: number): string[] {
  const overrun = start + before.length === lines.length + 1 && before.at(-1) === '';
  return overrun ? before.slice(0, -1) : before;
}

export function locateHunk(lines: readonly string[], hunk: Hunk): number | undefined {
  const { before: listed } = hunkLines(hunk);
  const expected = hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1;
  const before = withoutPastEnd(lines, listed, expected);
  if (matchesAt(lines, expected, before)) {
    return expected;
  }
  if (before.length === 0) {
    return undefined;
  }
  const found = lines.map((_, start) => start).filter((start) => matchesAt(lines, start, before));
  return found.length === 1 ? found[0] : undefined;
}

function coreOf(hunk: Hunk): Core {
  const all = hunk.lines;
  const first = all.findIndex(({ kind }) => kind !== ' ');
  const head = first === -1 ? all.length : first;
  const changed = all.slice(head, all.findLastIndex(({ kind }) => kind !== ' ') + 1);
  return { head, changed, span: changed.filter(({ kind }) => kind !== '+').length };
}

function offsetOf(lines: readonly string[], index: number): number {
  return lines.slice(0, index).reduce((sum, line) => sum + line.length, 0);
}

function replacement({ lines, changed, from, to, eol }: Replacement): {
  readonly text: string;
  readonly prefix: string;
} {
  const added = changed.filter(({ kind }) => kind !== '-').map(({ text }) => bare(text));
  const atEnd = to === lines.length;
  const unterminated = atEnd && lines.length > 0 && !LINE_END.test(lines.at(-1) ?? '');
  if (added.length === 0) {
    return { text: '', prefix: unterminated && from === to ? eol : '' };
  }
  const joined = added.join(eol);
  if (unterminated) {
    return { text: joined, prefix: from === to ? eol : '' };
  }
  return { text: `${joined}${eol}`, prefix: '' };
}

export function hunkEdit(text: string, hunk: Hunk): HunkEdit | undefined {
  const lines = linesOf(text);
  const start = locateHunk(lines, hunk);
  if (start === undefined) {
    return undefined;
  }
  const { head, changed, span } = coreOf(hunk);
  const from = start + head;
  const to = from + span;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const { text: body, prefix } = replacement({ lines, changed, from, to, eol });
  return {
    start: offsetOf(lines, from),
    end: offsetOf(lines, to),
    text: `${prefix}${body}`,
    line: from + 1,
  };
}

export function changedLines(hunk: Hunk): number[] {
  let line = hunk.oldCount === 0 ? hunk.oldStart + 1 : hunk.oldStart;
  const removed: number[] = [];
  for (const { kind } of hunk.lines) {
    if (kind === '-') {
      removed.push(line);
    }
    line += kind === '+' ? 0 : 1;
  }
  if (removed.length > 0) {
    return removed;
  }
  const { head } = coreOf(hunk);
  const anchor = hunk.oldCount === 0 ? hunk.oldStart + 1 : hunk.oldStart + head;
  return [anchor - 1, anchor];
}
