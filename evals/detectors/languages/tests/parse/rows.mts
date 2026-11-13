import { capture } from '../../../common/matches.mts';
import { closingBracket } from '../../text.mts';

const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);

export function topLevelParts(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (const [index, character] of text.split('').entries()) {
    depth += Number(OPENERS.has(character)) - Number(CLOSERS.has(character));
    if (character === ',' && depth === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter((part) => part !== '');
}

const LISTED_NAMES = new Set(['value', 'ints', 'strings', 'longs', 'doubles', 'floats', 'shorts']);
const LIST = /^(?:\w*[aA]rrayOf|listOf|setOf)?\s*([[{(])/u;

function elementCount(argument: string): number {
  const parsed = /^(?:(\w+)\s*=\s*)?([^]*)$/u.exec(argument.trim());
  const name = parsed?.[1];
  const value = parsed?.[2] ?? '';
  if (name !== undefined && !LISTED_NAMES.has(name)) return 0;
  const open = LIST.exec(value);
  if (open === null) return 1;
  const start = open[0].length - 1;
  return closingBracket(value, start) === value.length - 1
    ? topLevelParts(value.slice(start + 1, -1)).length
    : 1;
}

const PARAMETRIZE = /\bparametrize\s*\(/gu;

export function parametrizeRows(decorators: string): number | undefined {
  const found = [...decorators.matchAll(PARAMETRIZE)].map((match) => {
    const open = match.index + match[0].length - 1;
    const close = closingBracket(decorators, open);
    const second = topLevelParts(decorators.slice(open + 1, close === -1 ? undefined : close))[1];
    return second !== undefined && /^[[(]/u.test(second) ? elementCount(second) : undefined;
  });
  const counts: number[] = [];
  for (const count of found) {
    if (count === undefined) return undefined;
    counts.push(count);
  }
  return counts.length === 0 ? undefined : counts.reduce((product, count) => product * count, 1);
}

const COUNTED_SOURCES = new Map<string, number | 'literal'>([
  ['CsvSource', 'literal'],
  ['ValueSource', 'literal'],
  ['NullSource', 1],
  ['EmptySource', 1],
  ['NullAndEmptySource', 2],
]);
const UNCOUNTED_SOURCES =
  /@(?:[\w.]+\.)?(?:MethodSource|EnumSource|ArgumentsSource|CsvFileSource)\b/u;
const SOURCE =
  /@(?:[\w.]+\.)?(CsvSource|ValueSource|NullSource|EmptySource|NullAndEmptySource)\b/gu;

export function sourceRows(annotations: string): number | undefined {
  if (UNCOUNTED_SOURCES.test(annotations)) return undefined;
  const sources = [...annotations.matchAll(SOURCE)];
  if (sources.length === 0) return undefined;
  return sources.reduce((total, match) => {
    const kind = COUNTED_SOURCES.get(capture(match, 1));
    if (kind !== 'literal') return total + (kind ?? 0);
    const open = annotations.indexOf('(', match.index);
    const close = open === -1 ? -1 : closingBracket(annotations, open);
    const inside = close === -1 ? '' : annotations.slice(open + 1, close);
    return total + topLevelParts(inside).reduce((sum, part) => sum + elementCount(part), 0);
  }, 0);
}

export function rowCases(body: string): number | undefined {
  const count = [...body.matchAll(/(?<![\w.])row\s*\(/gu)].length;
  return count === 0 ? undefined : count;
}
