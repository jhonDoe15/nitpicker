import { groupJoinLengths, indentOf } from '../../../shared/conventions/lines.mjs';

const WIDTHS = [79, 88, 100, 120];
const BEYOND_WIDTH = 100;
const MAX_WIDTH = 120;
const MIN_BEYOND = 2;
const UNBREAKABLE_LINE = /:\/\/|^\s*(?:#|import\b)|#|['"][^'"]{30,}|^[^(){}[\];=,]*$/;
const GROUP_OPENER = /[([{]\s*$/;
const GROUP_CLOSER = /^\s*[)\]}]/;
const INNER_SKIP = /[([{,]\s*$|^\s*#/;
const TRIPLE_QUOTE = /"""|'''/g;

function withoutBlockStrings(lines) {
  let open = false;
  return lines.map((line) => {
    const quotes = (line.match(TRIPLE_QUOTE) ?? []).length;
    const inside = open || quotes > 0;
    open = quotes % 2 === 1 ? !open : open;
    return inside ? `${' '.repeat(Math.min(indentOf(line), line.length))}#` : line;
  });
}

export function lineLength(text) {
  const raw = text.split(/\r?\n/);
  if (raw.some((line) => line.startsWith('\t'))) {
    return undefined;
  }
  const lines = withoutBlockStrings(raw);
  const lengths = lines.filter((line) => !UNBREAKABLE_LINE.test(line)).map((line) => line.length);
  const longest = lengths.reduce((most, length) => Math.max(most, length), 0);
  const joins = groupJoinLengths(lines, {
    opener: GROUP_OPENER,
    closer: GROUP_CLOSER,
    skip: INNER_SKIP,
  });
  if (joins.length > 0) {
    const shortestJoin = joins.reduce((least, length) => Math.min(least, length), Infinity);
    const fitting = WIDTHS.filter((candidate) => longest <= candidate && candidate < shortestJoin);
    return fitting.length === 1 ? String(fitting[0]) : undefined;
  }
  const beyond = lengths.filter((length) => length > BEYOND_WIDTH).length;
  return longest <= MAX_WIDTH && beyond >= MIN_BEYOND ? String(MAX_WIDTH) : undefined;
}
