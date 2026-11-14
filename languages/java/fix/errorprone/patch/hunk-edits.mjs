import { linesOf } from '../../../../../core/fix/common/rewrite/line-hunks.mjs';

const CARRIAGE_RETURN = /\r$/u;
const LINE_END = /\r?\n$/u;

function bare(line) {
  return line.replace(LINE_END, '').replace(CARRIAGE_RETURN, '');
}

export function hunkLines(hunk) {
  return {
    before: hunk.lines.filter(({ kind }) => kind !== '+').map(({ text }) => bare(text)),
    after: hunk.lines.filter(({ kind }) => kind !== '-').map(({ text }) => bare(text)),
  };
}

function matchesAt(lines, start, before) {
  return (
    start >= 0 &&
    start + before.length <= lines.length &&
    before.every((line, offset) => bare(lines[start + offset]) === line)
  );
}

export function locateHunk(lines, hunk) {
  const { before } = hunkLines(hunk);
  const expected = hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1;
  if (matchesAt(lines, expected, before)) {
    return expected;
  }
  if (before.length === 0) {
    return undefined;
  }
  const found = lines.map((_, start) => start).filter((start) => matchesAt(lines, start, before));
  return found.length === 1 ? found[0] : undefined;
}

function coreOf(hunk) {
  const all = hunk.lines;
  const first = all.findIndex(({ kind }) => kind !== ' ');
  const head = first === -1 ? all.length : first;
  const changed = all.slice(head, all.findLastIndex(({ kind }) => kind !== ' ') + 1);
  return { head, changed, span: changed.filter(({ kind }) => kind !== '+').length };
}

function offsetOf(lines, index) {
  return lines.slice(0, index).reduce((sum, line) => sum + line.length, 0);
}

function replacement({ lines, changed, from, to, eol }) {
  const added = changed.filter(({ kind }) => kind !== '-').map(({ text }) => bare(text));
  const atEnd = to === lines.length;
  const unterminated = atEnd && lines.length > 0 && !LINE_END.test(lines.at(-1));
  if (added.length === 0) {
    return { text: '', prefix: unterminated && from === to ? eol : '' };
  }
  const joined = added.join(eol);
  if (unterminated) {
    return { text: joined, prefix: from === to ? eol : '' };
  }
  return { text: `${joined}${eol}`, prefix: '' };
}

export function hunkEdit(text, hunk) {
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

export function changedLines(hunk) {
  let line = hunk.oldCount === 0 ? hunk.oldStart + 1 : hunk.oldStart;
  const removed = [];
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
