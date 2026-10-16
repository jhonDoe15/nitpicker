const WIDTHS = [80, 100, 120];
const MAX_WIDTH = 120;
const UNBREAKABLE_LINE =
  /:\/\/|^\s*(?:import|export)\b.*\bfrom\b|^\s*(?:\/\/|\/\*|\*)|['"`][^'"`]{30,}|^\s*\/[^/*\s]|^[^(){}[\];=,]*$/;
const GROUP_OPENER = /[([]\s*$/;
const BREAKS_AFTER = /\s(?:=|=>)\s*$/;
const GROUP_CLOSER = /^\s*[)\]]/;
const INNER_SKIP = /[([{]\s*$|^\s*(?:<|\/\/|\/\*|\*)/;

export function printWidth(text) {
  const lines = text.split(/\r?\n/);
  if (lines.some((line) => line.startsWith('\t'))) {
    return undefined;
  }
  const lengths = lines.filter((line) => !UNBREAKABLE_LINE.test(line)).map((line) => line.length);
  const longest = Math.max(0, ...lengths);
  const shortestJoin = Math.min(...joinedGroupLengths(lines), ...joinedContinuations(lines));
  if (shortestJoin !== Infinity) {
    const fitting = WIDTHS.filter((candidate) => longest <= candidate && candidate < shortestJoin);
    return fitting.length === 1 ? String(fitting[0]) : undefined;
  }
  const beyond = lengths.filter((length) => length > WIDTHS[1]).length;
  return longest <= MAX_WIDTH && beyond >= 2 ? String(MAX_WIDTH) : undefined;
}

function joinedGroupLengths(lines) {
  return lines.flatMap((line, index) => {
    if (!GROUP_OPENER.test(line)) {
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
    const body = inner
      .map((other) => other.trim())
      .join(' ')
      .replace(/,$/, '');
    return [line.trimEnd().length + body.length + lines[closer].trim().length];
  });
}

function joinedContinuations(lines) {
  return lines.flatMap((line, index) => {
    const next = lines[index + 1] ?? '';
    const after = lines[index + 2] ?? '';
    const single =
      BREAKS_AFTER.test(line) &&
      indentOf(next) > indentOf(line) &&
      indentOf(after) <= indentOf(line) &&
      !INNER_SKIP.test(next);
    return single ? [line.trimEnd().length + 1 + next.trim().length] : [];
  });
}

function indentOf(line) {
  return line.trim().length === 0 ? Infinity : line.length - line.trimStart().length;
}
