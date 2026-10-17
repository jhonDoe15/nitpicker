import { bracketGroups, indentOf } from '../../../../shared/conventions/lines.mjs';

const WIDTHS = [100, 120, 140];
const MIN_BEYOND = 2;
export const UNBREAKABLE_LINE =
  /:\/\/|^\s*(?:import|package)\b|\/\/|\/\*|^\s*\*|"[^"]{30,}|^[^(){}[\];=,]*$/;
const KOTLIN_UNBREAKABLE_LINE = new RegExp(`${UNBREAKABLE_LINE.source}|\`[^\`]+\``);
const GROUP_OPENER = /\(\s*$/;
const GROUP_CLOSER = /^\s*\)/;
const INNER_SKIP = /[({]\s*$|^\s*(?:\/\/|\/\*|\*)/;
const RAW_STRING = /"""/g;
const TRAILING_COMMA = /,$/;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

export function withoutRawStrings(lines) {
  let open = false;
  return lines.map((line) => {
    const quotes = (line.match(RAW_STRING) ?? []).length;
    const inside = open || quotes > 0;
    open = quotes % 2 === 1 ? !open : open;
    return inside ? `${' '.repeat(Math.min(indentOf(line), line.length))}//` : line;
  });
}

function joinLength({ opener, inner, closer }) {
  const elements = inner.map((line) => line.trim());
  const last = elements.length - 1;
  elements[last] = elements[last].replace(TRAILING_COMMA, '');
  return opener.trimEnd().length + elements.join(' ').length + closer.trim().length;
}

function wrappedJoinLengths(lines) {
  return bracketGroups(lines, { opener: GROUP_OPENER, closer: GROUP_CLOSER })
    .filter(
      ({ inner }) =>
        inner.length > 0 &&
        inner.every((line) => indentOf(line) === indentOf(inner[0]) && !INNER_SKIP.test(line)),
    )
    .map(joinLength);
}

function beyondWidth(lengths, longest) {
  const lower = WIDTHS.findLast((width) => width < longest);
  const upper = WIDTHS.find((width) => width >= longest);
  const beyond = lengths.filter((length) => length > lower).length;
  return lower !== undefined && upper !== undefined && beyond >= MIN_BEYOND
    ? String(upper)
    : undefined;
}

export function lineLength(text) {
  return measuredLineLength(text, {
    unbreakable: KOTLIN_UNBREAKABLE_LINE,
    joinLengths: wrappedJoinLengths,
  });
}

export function measuredLineLength(text, { unbreakable, joinLengths, wrappedOnly = false }) {
  const lines = withoutRawStrings(text.split(/\r?\n/));
  if (lines.some((line) => line.startsWith('\t') && !COMMENT_LINE.test(line))) {
    return undefined;
  }
  const lengths = lines.filter((line) => !unbreakable.test(line)).map((line) => line.length);
  const longest = lengths.reduce((most, length) => Math.max(most, length), 0);
  const joins = joinLengths(lines);
  if (joins.length > 0) {
    const shortestJoin = Math.min(...joins);
    const fitting = WIDTHS.filter((width) => longest <= width && width < shortestJoin);
    return fitting.length === 1 ? String(fitting[0]) : undefined;
  }
  return wrappedOnly ? undefined : beyondWidth(lengths, longest);
}
