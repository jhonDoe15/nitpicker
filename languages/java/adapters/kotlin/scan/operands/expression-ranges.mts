import { chainFrom } from '../typed/typed-scan.mts';
import type {
  Compound,
  ExpressionRange,
  Group,
  Item,
  Token,
  TokenState,
} from '../typed/operand-shapes.mts';

type SplitState = TokenState & {
  lines: boolean;
  ranges: ExpressionRange[];
  current: Item[];
  compound: Compound | undefined;
  closeAfter?: number | undefined;
};

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
const LABELLED = new Set(['this', 'super']);
const MEMBER_MARKS = new Set(['.', '?.', '::']);
const LINE_STARTS = new Set(['.', '?.', '?:', '&&', '||', '::']);

function groupItems(closes: Map<number, number>, { from, to }: Group): Item[] {
  if (from >= to) {
    return [];
  }
  return chainFrom<Item>({ token: from, close: closes.get(from) }, (item: Item) => {
    const next = (item.close ?? item.token) + 1;
    return next < to ? { token: next, close: closes.get(next) } : undefined;
  });
}

function isSeparator(tokens: Token[], item: Item): boolean {
  if (item.close !== undefined) {
    return false;
  }
  const { kind = '', text = '' } = tokens[item.token] ?? {};
  const isMember = MEMBER_MARKS.has(tokens[item.token - 1]?.text ?? '');
  return (
    SEPARATORS.has(text) ||
    COMPOUND.has(text) ||
    (kind === 'at' && !LABELLED.has(tokens[item.token - 1]?.text ?? '')) ||
    (STATEMENT_KEYWORDS.has(text) && !isMember)
  );
}

function breaksLine(state: SplitState, previous: Item | undefined, item: Item): boolean {
  const { tokens } = state;
  const current = tokens[item.token];
  if (!state.lines || current?.newline !== true || previous === undefined) {
    return false;
  }
  const before = previous.close === undefined ? (tokens[previous.token]?.text ?? '') : ')';
  return !(LINE_ENDS.has(before) || LINE_STARTS.has(current.text));
}

function headGroup(tokens: Token[], items: Item[], position: number): boolean {
  const keyword = tokens[items[position]?.token ?? -1]?.text ?? '';
  const next = items[position + 1];
  return HEADED.has(keyword) && next?.close !== undefined && tokens[next.token]?.text === '(';
}

function closeRange(state: SplitState): ExpressionRange | undefined {
  if (state.current.length === 0) {
    return undefined;
  }
  const range = { items: state.current, after: state.compound };
  state.ranges.push(range);
  state.compound = undefined;
  state.current = [];
  return range;
}

function splitStep(state: SplitState, position: number): void {
  const { tokens, items } = state;
  const item = items[position];
  if (item === undefined) {
    return;
  }
  const separates = isSeparator(tokens, item);
  const closed =
    separates || breaksLine(state, items[position - 1], item) ? closeRange(state) : undefined;
  const text = tokens[item.token]?.text ?? '';
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

function splitItems(tokens: Token[], items: Item[], opener: string | undefined): ExpressionRange[] {
  const lines = opener === '{' || opener === undefined;
  const state: SplitState = { tokens, items, lines, ranges: [], current: [], compound: undefined };
  for (const position of items.keys()) {
    splitStep(state, position);
  }
  closeRange(state);
  return state.ranges;
}

export function expressionRanges(tokens: Token[], closes: Map<number, number>): ExpressionRange[] {
  const groups: Group[] = [
    { from: 0, to: tokens.length, opener: undefined },
    ...[...closes].map(([open, close]) => ({
      from: open + 1,
      to: close,
      opener: tokens[open]?.text,
      open,
    })),
  ];
  return groups.flatMap((group) => {
    const items = groupItems(closes, group);
    const ranges = splitItems(tokens, items, group.opener);
    const [only] = ranges;
    if (ranges.length === 1 && only?.items.length === items.length) {
      only.group = group.open;
    }
    return ranges;
  });
}
