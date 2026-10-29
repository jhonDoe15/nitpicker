import { closingBracket } from '../../text.mjs';

const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);

/** The top-level comma-separated parts of `text`, which must be masked, without empty ones. */
export function topLevelParts(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index <= text.length; index += 1) {
    const character = text[index];
    depth += Number(OPENERS.has(character)) - Number(CLOSERS.has(character));
    if (index === text.length || (character === ',' && depth === 0)) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  return parts.filter((part) => part !== '');
}

const LISTED_NAMES = new Set(['value', 'ints', 'strings', 'longs', 'doubles', 'floats', 'shorts']);
const LIST = /^(?:\w*[aA]rrayOf|listOf|setOf)?\s*([[{(])/u;

// The elements of an argument that is a list written out, 1 for a single value, 0 for a setting.
function elementCount(argument) {
  const [, name, value] = /^(?:(\w+)\s*=\s*)?([^]*)$/u.exec(argument.trim());
  if (name !== undefined && !LISTED_NAMES.has(name)) return 0;
  const open = LIST.exec(value);
  if (open === null) return 1;
  const start = open[0].length - 1;
  return closingBracket(value, start) === value.length - 1
    ? topLevelParts(value.slice(start + 1, -1)).length
    : 1;
}

const PARAMETRIZE = /\bparametrize\s*\(/gu;

/**
 * The number of cases `@pytest.mark.parametrize` decorators give a Python test: the product of
 * their literal lists, or undefined when a list is not written out (a variable, a call).
 */
export function parametrizeRows(decorators) {
  const found = [...decorators.matchAll(PARAMETRIZE)].map((match) => {
    const open = match.index + match[0].length - 1;
    const close = closingBracket(decorators, open);
    const second = topLevelParts(decorators.slice(open + 1, close === -1 ? undefined : close))[1];
    return second !== undefined && /^[[(]/u.test(second) ? elementCount(second) : undefined;
  });
  if (found.length === 0 || found.includes(undefined)) return undefined;
  return found.reduce((product, count) => product * count, 1);
}

const COUNTED_SOURCES = new Map([
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

/**
 * The number of cases JUnit argument sources give a parameterized test (`@CsvSource`,
 * `@ValueSource`, `@NullSource`, `@EmptySource`), or undefined when the test has none or reads its
 * cases from elsewhere (`@MethodSource`, `@EnumSource`, a file).
 */
export function sourceRows(annotations) {
  if (UNCOUNTED_SOURCES.test(annotations)) return undefined;
  const sources = [...annotations.matchAll(SOURCE)];
  if (sources.length === 0) return undefined;
  return sources.reduce((total, match) => {
    const kind = COUNTED_SOURCES.get(match[1]);
    if (kind !== 'literal') return total + kind;
    const open = annotations.indexOf('(', match.index);
    const close = open === -1 ? -1 : closingBracket(annotations, open);
    const inside = close === -1 ? '' : annotations.slice(open + 1, close);
    return total + topLevelParts(inside).reduce((sum, part) => sum + elementCount(part), 0);
  }, 0);
}

/** The number of `row(...)` cases of a Kotest data-driven body, or undefined when it has none. */
export function rowCases(body) {
  const count = [...body.matchAll(/(?<![\w.])row\s*\(/gu)].length;
  return count === 0 ? undefined : count;
}
