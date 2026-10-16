import { indentOf } from '../../../shared/conventions/lines.mjs';

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
  const longest = Math.max(0, ...lengths);
  const joins = joinedGroupLengths(lines);
  if (joins.length > 0) {
    const shortestJoin = Math.min(...joins);
    const fitting = WIDTHS.filter((candidate) => longest <= candidate && candidate < shortestJoin);
    return fitting.length === 1 ? String(fitting[0]) : undefined;
  }
  const beyond = lengths.filter((length) => length > BEYOND_WIDTH).length;
  return longest <= MAX_WIDTH && beyond >= MIN_BEYOND ? String(MAX_WIDTH) : undefined;
}

function joinedGroupLengths(lines) {
  return lines.flatMap((line, index) => {
    if (!GROUP_OPENER.test(line) || UNBREAKABLE_LINE.test(line)) {
      return [];
    }
    const indent = indentOf(line);
    const closer = lines.findIndex((other, at) => at > index && indentOf(other) <= indent);
    const inner = lines.slice(index + 1, closer);
    const simple =
      closer > index + 1 &&
      indentOf(lines[closer]) === indent &&
      GROUP_CLOSER.test(lines[closer]) &&
      inner.every((other) => indentOf(other) === indentOf(inner[0]) && !INNER_SKIP.test(other));
    if (!simple) {
      return [];
    }
    const body = inner.map((other) => other.trim()).join(' ');
    return [line.trimEnd().length + body.length + lines[closer].trim().length];
  });
}
