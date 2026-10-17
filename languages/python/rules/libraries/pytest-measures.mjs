const FIXTURE = /^[ \t]*@(?:pytest\.)?fixture(\(\s*\))?[ \t]*$/gmu;
const MARK =
  /^[ \t]*@pytest\.mark\.(?!parametrize\b|skip\b|skipif\b|xfail\b|usefixtures\b|filterwarnings\b)\w+(\(\s*\))?[ \t]*$/gmu;
const PARAMETRIZE = /@pytest\.mark\.parametrize\(/gu;
const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);
const QUOTES = new Set(['"', "'"]);

function countParentheses(text, pattern) {
  const matches = [...text.matchAll(pattern)];
  const withParentheses = matches.filter((match) => match[1] !== undefined).length;
  return { withParentheses, without: matches.length - withParentheses };
}

export function fixtureCounts(text) {
  return countParentheses(text, FIXTURE);
}

export function markCounts(text) {
  return countParentheses(text, MARK);
}

export function parenthesesChoice(counts) {
  const total = counts.reduce(
    (sum, entry) => ({
      withParentheses: sum.withParentheses + entry.withParentheses,
      without: sum.without + entry.without,
    }),
    { withParentheses: 0, without: 0 },
  );
  return total.withParentheses === total.without
    ? undefined
    : total.withParentheses > total.without;
}

function topLevelArguments(text, start) {
  const starts = [start];
  let depth = 0;
  let quote;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quote !== undefined) {
      quote = character === quote && text[index - 1] !== '\\' ? undefined : quote;
    } else if (QUOTES.has(character)) {
      quote = character;
    } else if (OPENERS.has(character)) {
      depth += 1;
    } else if (CLOSERS.has(character)) {
      if (depth === 0) {
        break;
      }
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      starts.push(index + 1);
    }
  }
  return starts.slice(0, 2).map((position) => text.slice(position).trimStart());
}

function namesType(argument) {
  if (argument.startsWith('(')) {
    return 'tuple';
  }
  if (argument.startsWith('[')) {
    return 'list';
  }
  const text = /^(["'])([^"']*)\1/u.exec(argument)?.[2];
  return text?.includes(',') === true ? 'csv' : undefined;
}

function sequenceType(argument = '') {
  if (argument.startsWith('[')) {
    return 'list';
  }
  return argument.startsWith('(') ? 'tuple' : undefined;
}

function rowType(values = '') {
  const inner = values.slice(1).trimStart();
  if (inner.startsWith('(')) {
    return 'tuple';
  }
  return inner.startsWith('[') ? 'list' : undefined;
}

export function parametrizeUses(text) {
  return [...text.matchAll(PARAMETRIZE)].map((match) => {
    const [names = '', values] = topLevelArguments(text, match.index + match[0].length);
    return { names: namesType(names), values: sequenceType(values), row: rowType(values) };
  });
}

export function mostCommon(values) {
  const counts = new Map();
  for (const value of values.filter((entry) => entry !== undefined)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ranked.length === 0 || ranked[1]?.[1] === ranked[0][1] ? undefined : ranked[0][0];
}
