const STATEMENT_KEYWORDS = new Set([
  'val',
  'var',
  'fun',
  'return',
  'throw',
  'if',
  'else',
  'when',
  'while',
  'for',
  'do',
  'try',
  'catch',
  'finally',
  'class',
  'interface',
  'object',
  'typealias',
  'import',
  'package',
  'break',
  'continue',
]);
const HEADED = new Set(['if', 'while', 'for', 'when', 'catch']);
const SEPARATORS = new Set([',', ';', '=', '->', ':', '@']);
const COMPOUND = new Set(['+=', '-=', '*=', '/=', '%=']);
const LINE_ENDS = new Set([
  '.',
  '?.',
  '::',
  '?:',
  '&&',
  '||',
  '==',
  '!=',
  '===',
  '!==',
  '<',
  '>',
  '<=',
  '>=',
  '+',
  '-',
  '*',
  '/',
  '%',
  '..',
  '..<',
  'as',
  'as?',
  'is',
  '!is',
  'in',
  '!in',
]);
const MEMBER_MARKS = new Set(['.', '?.', '::']);
const LINE_STARTS = new Set(['.', '?.', '?:', '&&', '||', '::']);

function groupItems(closes, { from, to }) {
  const items = [];
  let next = from;
  for (const index of Array.from({ length: to - from }, (_, step) => from + step)) {
    const close = index >= next ? closes.get(index) : undefined;
    if (index >= next) {
      items.push(close === undefined ? { token: index } : { token: index, close });
      next = (close ?? index) + 1;
    }
  }
  return items;
}

function isSeparator(tokens, item) {
  if (item.close !== undefined) {
    return false;
  }
  const { kind, text } = tokens[item.token];
  const isMember = MEMBER_MARKS.has(tokens[item.token - 1]?.text);
  return (
    SEPARATORS.has(text) ||
    COMPOUND.has(text) ||
    kind === 'at' ||
    (STATEMENT_KEYWORDS.has(text) && !isMember)
  );
}

function breaksLine(state, previous, item) {
  const { tokens } = state;
  if (!state.lines || !tokens[item.token].newline || previous === undefined) {
    return false;
  }
  const before = previous.close === undefined ? tokens[previous.token].text : ')';
  return !LINE_ENDS.has(before) && !LINE_STARTS.has(tokens[item.token].text);
}

function headGroup(tokens, items, position) {
  const keyword = tokens[items[position].token].text;
  const next = items[position + 1];
  const isHead = HEADED.has(keyword) && next?.close !== undefined;
  return isHead && tokens[next.token].text === '(';
}

function closeRange(state) {
  if (state.current.length === 0) {
    return undefined;
  }
  const range = { items: state.current, after: state.compound };
  state.ranges.push(range);
  state.compound = undefined;
  state.current = [];
  return range;
}

function splitStep(state, position) {
  const { tokens, items } = state;
  const item = items[position];
  const separates = isSeparator(tokens, item);
  const closed =
    separates || breaksLine(state, items[position - 1], item) ? closeRange(state) : undefined;
  const text = tokens[item.token].text;
  if (separates && COMPOUND.has(text)) {
    state.compound =
      closed === undefined ? undefined : { operator: text.slice(0, 1), target: closed };
  }
  if (separates) {
    state.closeAfter = headGroup(tokens, items, position) ? position + 1 : undefined;
    return;
  }
  state.current.push(item);
  if (state.closeAfter === position) {
    closeRange(state);
  }
}

function splitItems(tokens, items, opener) {
  const lines = opener === '{' || opener === undefined;
  const state = { tokens, items, lines, ranges: [], current: [], compound: undefined };
  for (const position of items.keys()) {
    splitStep(state, position);
  }
  closeRange(state);
  return state.ranges;
}

/**
 * The expression ranges of a token list: each group's content cut at statement keywords, `,`, `;`,
 * `=`, `->`, `:`, compound assignments and (outside parentheses and brackets) line breaks that end
 * a statement. A range after a compound assignment names it as `after`, with the target range.
 */
export function expressionRanges(tokens, closes) {
  const groups = [
    { from: 0, to: tokens.length, opener: undefined },
    ...[...closes].map(([open, close]) => ({
      from: open + 1,
      to: close,
      opener: tokens[open].text,
      open,
    })),
  ];
  return groups.flatMap((group) => {
    const ranges = splitItems(tokens, groupItems(closes, group), group.opener);
    if (ranges.length === 1) {
      ranges[0].group = group.open;
    }
    return ranges;
  });
}
