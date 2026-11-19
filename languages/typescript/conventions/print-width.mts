import { indentOf as untypedIndentOf } from '../../../shared/conventions/lines.mjs';
import {
  largest as untypedLargest,
  smallest as untypedSmallest,
} from '../../../shared/lists/items.mjs';

const indentOf: (line: string) => number = untypedIndentOf;
const largest: (values: readonly number[]) => number = untypedLargest;
const smallest: (values: readonly number[]) => number = untypedSmallest;

const WIDTHS = [80, 100, 120] as const;
const MAX_WIDTH = 120;
const UNBREAKABLE_LINE =
  /:\/\/|^\s*(?:import|export)\b.+\bfrom\b|^\s*(?:\/\/|\/\*|\*)|['"`][^'"`]{30,}|^\s*\/[^/*\s]|^[^(){}[\];=,]*$/;
const GROUP_OPENER = /[([]\s*$/;
const BREAKS_AFTER = /\s(?:=|=>)\s*$/;
const GROUP_CLOSER = /^\s*[)\]]/;
const INNER_SKIP = /[([{]\s*$|^\s*(?:<|\/\/|\/\*|\*)/;

export function printWidth(text: string): string | undefined {
  const lines = text.split(/\r?\n/);
  if (lines.some((line) => line.startsWith('\t'))) {
    return undefined;
  }
  const lengths = lines.filter((line) => !UNBREAKABLE_LINE.test(line)).map((line) => line.length);
  const longest = largest([0, ...lengths]);
  const shortestJoin = smallest([...joinedGroupLengths(lines), ...joinedContinuations(lines)]);
  if (shortestJoin !== Infinity) {
    const fitting = WIDTHS.filter((candidate) => longest <= candidate && candidate < shortestJoin);
    return fitting.length === 1 ? String(fitting[0]) : undefined;
  }
  const beyond = lengths.filter((length) => length > WIDTHS[1]).length;
  return longest <= MAX_WIDTH && beyond >= 2 ? String(MAX_WIDTH) : undefined;
}

function joinedGroupLengths(lines: readonly string[]): number[] {
  return lines.flatMap((line, index) => {
    if (!GROUP_OPENER.test(line)) {
      return [];
    }
    const indent = indentOf(line);
    const closer = lines.findIndex((other, at) => at > index && indentOf(other) <= indent);
    const inner = lines.slice(index + 1, closer);
    const closing = lines[closer] ?? '';
    const simple =
      closer > index + 1 &&
      indentOf(closing) === indent &&
      GROUP_CLOSER.test(closing) &&
      inner.every(
        (other) => indentOf(other) === indentOf(inner[0] ?? '') && !INNER_SKIP.test(other),
      );
    if (!simple) {
      return [];
    }
    const body = inner
      .map((other) => other.trim())
      .join(' ')
      .replace(/,$/, '');
    return [line.trimEnd().length + body.length + closing.trim().length];
  });
}

function joinedContinuations(lines: readonly string[]): number[] {
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
