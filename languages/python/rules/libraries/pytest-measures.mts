const FIXTURE = /^[ \t]*@(?:pytest\.)?fixture(\(\s*\))?[ \t]*$/gmu;
const BUILT_IN_MARKS = 'parametrize|skip|skipif|xfail|usefixtures|filterwarnings';
const MARK = new RegExp(
  String.raw`^[ \t]*@pytest\.mark\.(?!(?:${BUILT_IN_MARKS})\b)\w+(\(\s*\))?[ \t]*$`,
  'gmu',
);
const PARAMETRIZE = /@pytest\.mark\.parametrize\(/gu;
const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);
const QUOTES = new Set(['"', "'"]);

export type Counts = { withParentheses: number; without: number };
type ParseState = { depth: number; quote: string; done: boolean };
const TUPLE = 'tuple';
type Layout = typeof TUPLE | 'list' | 'csv';
export type ParametrizeUse = {
  names: Layout | undefined;
  values: Layout | undefined;
  row: Layout | undefined;
};

function countParentheses(text: string, pattern: RegExp): Counts {
  const matches = [...text.matchAll(pattern)];
  const withParentheses = matches.filter((match) => match[1] !== undefined).length;
  return { withParentheses, without: matches.length - withParentheses };
}

export function fixtureCounts(text: string): Counts {
  return countParentheses(text, FIXTURE);
}

export function markCounts(text: string): Counts {
  return countParentheses(text, MARK);
}

export function parenthesesChoice(counts: readonly Counts[]): boolean[] {
  const total = counts.reduce(
    (sum, entry) => ({
      withParentheses: sum.withParentheses + entry.withParentheses,
      without: sum.without + entry.without,
    }),
    { withParentheses: 0, without: 0 },
  );
  return total.withParentheses === total.without ? [] : [total.withParentheses > total.without];
}

function nextState(state: ParseState, character: string, previous: string | undefined): ParseState {
  const { depth, quote } = state;
  if (quote !== '') {
    return { ...state, quote: character === quote && previous !== '\\' ? '' : quote };
  }
  if (QUOTES.has(character)) {
    return { ...state, quote: character };
  }
  if (OPENERS.has(character)) {
    return { ...state, depth: depth + 1 };
  }
  if (!CLOSERS.has(character)) {
    return state;
  }
  return depth === 0 ? { ...state, done: true } : { ...state, depth: depth - 1 };
}

function topLevelArguments(text: string, start: number): string[] {
  const tail = text.slice(start).split('');
  const starts = [start];
  let state: ParseState = { depth: 0, quote: '', done: false };
  for (const [offset, character] of tail.entries()) {
    state = nextState(state, character, tail[offset - 1]);
    if (state.done) {
      break;
    }
    if (character === ',' && state.depth === 0 && state.quote === '') {
      starts.push(start + offset + 1);
    }
  }
  return starts.slice(0, 2).map((position) => text.slice(position).trimStart());
}

function namesType(argument: string): Layout | undefined {
  if (argument.startsWith('(')) {
    return TUPLE;
  }
  if (argument.startsWith('[')) {
    return 'list';
  }
  const text = /^(["'])([^"']*)\1/u.exec(argument)?.[2];
  return text?.includes(',') === true ? 'csv' : undefined;
}

function sequenceType(argument = ''): Layout | undefined {
  if (argument.startsWith('[')) {
    return 'list';
  }
  return argument.startsWith('(') ? 'tuple' : undefined;
}

function rowType(values = ''): Layout | undefined {
  const inner = values.slice(1).trimStart();
  if (inner.startsWith('(')) {
    return TUPLE;
  }
  return inner.startsWith('[') ? 'list' : undefined;
}

export function parametrizeUses(text: string): ParametrizeUse[] {
  return [...text.matchAll(PARAMETRIZE)].map((match) => {
    const [names = '', values] = topLevelArguments(text, match.index + match[0].length);
    return { names: namesType(names), values: sequenceType(values), row: rowType(values) };
  });
}

export function mostCommon<T>(values: readonly (T | undefined)[]): T | undefined {
  const counts = new Map<T, number>();
  for (const value of values.filter((entry) => entry !== undefined)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ranked.length === 0 || ranked[1]?.[1] === ranked[0]?.[1] ? undefined : ranked[0]?.[0];
}
