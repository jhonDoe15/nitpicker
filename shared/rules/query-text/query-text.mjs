export const OPAQUE = '\u0001';

const FULL_QUERY =
  /^\s*(?:select|insert\s+into|update\s+\S+\s+set|delete\s+from|merge\s+into|with\s+\S+\s+as)\b/iu;
const FRAGMENT =
  /^\s*(?:and|or|where|order\s+by|group\s+by|having|limit|set|on|(?:left\s+|inner\s+|right\s+)?join)\b/iu;
const END_OPERATOR = /(?:<>|!=|<=|>=|(?<![-=<>!])[=<>]|\b(?:not\s+)?(?:i?like|in|between))\s*$/iu;
const MID_OPERATOR =
  /(?:<>|!=|<=|>=|(?<![-=<>!])=|\b(?:i?like|in))\s+(?:and|or|order|group|limit|having|union)\b/iu;
const STRUCTURE = /\b(?:from|where|set|values|join|and|or|on|having)\b/iu;
const INSERT = /insert\s+into\s+[^\s(]+\s*\(([^)]*)\)\s*values\s*\(/iu;
const KEYWORDS = new Set([
  'select',
  'from',
  'where',
  'and',
  'or',
  'on',
  'set',
  'values',
  'join',
  'group',
  'order',
  'by',
  'having',
  'limit',
  'offset',
  'union',
  'then',
  'else',
  'end',
  'local',
]);
const PROSE_WORD =
  /\b(?:the|this|that|these|those|are|was|were|been|of|to|which|because|should|would|could)\b/giu;
const PROSE_WORDS = 2;
const SCRIPT_CALL = 'redis.call(';
const WORD_END = /[A-Za-z0-9_]$/u;
const WORD_START = /^[A-Za-z0-9_]/u;
const FIRST_WORD = /^([A-Za-z]+)/u;
const LAST_WORD = /([A-Za-z]+)$/u;
const SNIPPET = 40;

const PAREN_STEPS = new Map([
  ['(', 1],
  [')', -1],
]);
const BRACKET_STEPS = new Map([
  ['(', 1],
  ['[', 1],
  ['{', 1],
  [')', -1],
  [']', -1],
  ['}', -1],
]);

export function isFullQuery(text) {
  return FULL_QUERY.test(text);
}

function isQueryText(text) {
  return FULL_QUERY.test(text) || FRAGMENT.test(text);
}

function* codeCharacters(text, from) {
  let quote = '';
  for (const [offset, character] of text.slice(from).split('').entries()) {
    if (quote !== '') {
      quote = character === quote ? '' : quote;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else {
      yield { index: from + offset, character };
    }
  }
}

function topLevelCount(text) {
  let depth = 0;
  let count = text.trim() === '' ? 0 : 1;
  for (const { character } of codeCharacters(text, 0)) {
    depth += BRACKET_STEPS.get(character) ?? 0;
    count += character === ',' && depth === 0 ? 1 : 0;
  }
  return count;
}

function valuesList(text, from) {
  let depth = 1;
  for (const { index, character } of codeCharacters(text, from)) {
    depth += PAREN_STEPS.get(character) ?? 0;
    if (depth === 0) {
      return text.slice(from, index);
    }
  }
  return undefined;
}

function columnCountProblem(text) {
  const match = INSERT.exec(text);
  const values = match === null ? undefined : valuesList(text, match.index + match[0].length);
  if (values === undefined || values.includes(OPAQUE) || match[1].includes(OPAQUE)) {
    return undefined;
  }
  const columns = topLevelCount(match[1]);
  const given = topLevelCount(values);
  return columns === given ? undefined : { kind: 'count', columns, values: given };
}

function around(text, index) {
  const start = Math.max(0, index - SNIPPET);
  return text
    .slice(start, index + SNIPPET)
    .replaceAll(OPAQUE, '?')
    .replaceAll(/\s+/gu, ' ')
    .trim();
}

function operandProblem(text, complete) {
  if (!STRUCTURE.test(text)) {
    return undefined;
  }
  const found = MID_OPERATOR.exec(text) ?? (complete ? END_OPERATOR.exec(text) : undefined);
  return found === null || found === undefined
    ? undefined
    : { kind: 'operand', snippet: around(text, found.index) };
}

export function queryTextProblem(text, { complete }) {
  if (!isQueryText(text) || (text.match(PROSE_WORD) ?? []).length >= PROSE_WORDS) {
    return undefined;
  }
  return operandProblem(text, complete) ?? columnCountProblem(text);
}

function joinedSnippet(left, right) {
  const half = SNIPPET / 2;
  return `${left.slice(-half)}${right.slice(0, half)}`.replaceAll(/\s+/gu, ' ');
}

export function runTogether(left, right) {
  const last = LAST_WORD.exec(left)?.[1]?.toLowerCase();
  const first = FIRST_WORD.exec(right)?.[1]?.toLowerCase();
  const together = WORD_END.test(left) && WORD_START.test(right);
  const keyword = KEYWORDS.has(last) || KEYWORDS.has(first);
  const query = isQueryText(left) || isQueryText(right) || `${left}${right}`.includes(SCRIPT_CALL);
  return together && keyword && query
    ? { kind: 'joined', snippet: joinedSnippet(left, right) }
    : undefined;
}

export function queryProblemMessage(problem) {
  const { kind, snippet, columns, values } = problem;
  if (kind === 'operand') {
    return (
      `The query text \`...${snippet}...\` has a comparison operator with no operand after it, ` +
      'so the statement fails on the path that uses this fragment. Add a bind placeholder or the value.'
    );
  }
  if (kind === 'count') {
    return (
      `The INSERT lists ${String(columns)} columns but ${String(values)} values. ` +
      'Give each column one value or bind placeholder.'
    );
  }
  return (
    `The query parts join into \`...${snippet}...\`, which runs two words together. ` +
    'Start each appended fragment with a space.'
  );
}
