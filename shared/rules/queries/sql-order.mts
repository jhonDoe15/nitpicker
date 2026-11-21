import { appendAll } from '../../lists/lists.mts';
import { DYNAMIC } from '../security/sql-text.mts';

const PAGE = 'page';

export const AGGREGATE_GAP = 'aggregate';

export type SqlOrderGap = {
  kind: typeof PAGE | typeof AGGREGATE_GAP;
  form: string;
  index: number;
};

type Scope = {
  start: number;
  name: string;
  text: string;
  opaque: boolean;
  aggregates: SqlOrderGap[];
  childOrdered: boolean;
};

const AGGREGATES = new Set(['array_agg', 'json_agg', 'jsonb_agg']);
const MASKED = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|"(?:[^"]|"")*"|`[^`]*`/gu;
const SELECT = /\bselect\b/u;
const ORDER_BY = /\border\s+by\b/u;
const PAGE_CLAUSE = new RegExp(
  String.raw`(?<![\w$:.])(?:limit|offset)\s+(?:\d+|${DYNAMIC}|\?|:\w+|\$\d+|%s)|\bfetch\s+(?:first|next)\b`,
  'u',
);
const FROM = /\bfrom\b/u;
const SINGLE_ROW = /\blimit\s+1\b|\bfetch\s+(?:first|next)\s+(?:1\s+)?rows?\b/u;
const SELECT_START = /\bselect\s/u;
const MODIFIER = /^\s*(?:all|distinct)\s/u;
const SELECTION_END = /\b(?:from|limit|fetch)\b/u;
const CONSTANT_ITEM = new RegExp(
  String.raw`^(?:\d+|true|false|null|''|(?:count|exists|max|min|sum|avg)\s*\(\)|${DYNAMIC})(?:\s+(?:as\s+)?[\w$]+)?$`,
  'u',
);
const VALUE_WORDS = [
  'like',
  'ilike',
  'in',
  'between',
  'and',
  'or',
  'not',
  'is',
  'limit',
  'offset',
  'where',
  'on',
  'having',
  'when',
  'then',
  'else',
  'values',
  'any',
  'all',
  'first',
  'next',
  'by',
  'select',
  'set',
  'distinct',
];
const VALUE_BEFORE = new RegExp(
  String.raw`(?:[=<>!+\-*/%,(|]|\b(?:${VALUE_WORDS.join('|')}))\s*$`,
  'u',
);
const FUNCTION_NAME = /([\w$]+)\s*$/u;
const EXISTS = 'exists';

function top(stack: readonly Scope[]): Scope {
  const scope = stack.at(-1);
  if (scope === undefined) {
    throw new TypeError('The scope stack is empty');
  }
  return scope;
}

function masked(text: string): string {
  return text
    .replaceAll(MASKED, (quoted: string) => (quoted.startsWith("'") ? "''" : 'q'))
    .toLowerCase();
}

function newScope(start: number, name: string): Scope {
  return { start, name, text: '', opaque: false, aggregates: [], childOrdered: false };
}

function isOrderedSelect(scope: Scope): boolean {
  return SELECT.test(scope.text) && ORDER_BY.test(scope.text);
}

function selectionOf(text: string): string | undefined {
  const start = SELECT_START.exec(text);
  if (start === null) {
    return undefined;
  }
  const rest = text.slice(start.index + start[0].length).replace(MODIFIER, '');
  const end = rest.search(SELECTION_END);
  return end === -1 ? rest : rest.slice(0, end);
}

function isConstantSelection(text: string): boolean {
  const selection = selectionOf(text);
  const items = selection === undefined ? [] : selection.split(',').map((item) => item.trim());
  return items.length > 0 && items.every((item) => CONSTANT_ITEM.test(item));
}

function isUnorderedSelect(scope: Scope): boolean {
  const { text } = scope;
  return (
    !scope.opaque &&
    scope.name !== EXISTS &&
    SELECT.test(text) &&
    FROM.test(text) &&
    !ORDER_BY.test(text)
  );
}

function pageGap(scope: Scope): SqlOrderGap[] {
  const clause = PAGE_CLAUSE.exec(scope.text);
  if (clause === null || !isUnorderedSelect(scope)) {
    return [];
  }
  const existence = SINGLE_ROW.test(scope.text) && isConstantSelection(scope.text);
  const form = clause[0].replaceAll(DYNAMIC, '?').replaceAll(/\s+/gu, ' ').toUpperCase();
  return existence ? [] : [{ kind: PAGE, form, index: scope.start }];
}

function aggregateGaps(scope: Scope): SqlOrderGap[] {
  return scope.childOrdered || scope.opaque ? [] : scope.aggregates;
}

function closeScope(scope: Scope, parent: Scope | undefined, gaps: SqlOrderGap[]): void {
  appendAll(gaps, pageGap(scope));
  appendAll(gaps, aggregateGaps(scope));
  if (parent === undefined) {
    return;
  }
  parent.text += '()';
  parent.opaque ||= scope.opaque && !SELECT.test(scope.text);
  parent.childOrdered ||= isOrderedSelect(scope);
  const unordered = AGGREGATES.has(scope.name) && !scope.opaque && !ORDER_BY.test(scope.text);
  if (unordered) {
    parent.aggregates.push({ kind: AGGREGATE_GAP, form: `${scope.name}(...)`, index: scope.start });
  }
}

function openScope(stack: Scope[], index: number): void {
  const scope = top(stack);
  const name = FUNCTION_NAME.exec(scope.text)?.[1] ?? '';
  stack.push(newScope(index, name));
}

function addDynamic(scope: Scope, nested: boolean): void {
  scope.opaque ||= !(VALUE_BEFORE.test(scope.text) || (nested && scope.text.trim() === ''));
  scope.text += DYNAMIC;
}

function closeRemaining(stack: readonly Scope[], gaps: SqlOrderGap[]): void {
  for (const [depth, scope] of [...stack.entries()].toReversed()) {
    closeScope(scope, stack[depth - 1], gaps);
  }
}

export function sqlOrderGaps(text: string): SqlOrderGap[] {
  const source = masked(text);
  const stack = [newScope(0, '')];
  const gaps: SqlOrderGap[] = [];
  for (const [index, character] of Array.from(source).entries()) {
    if (character === '(') {
      openScope(stack, index);
    } else if (character === ')' && stack.length > 1) {
      const scope = top(stack);
      stack.pop();
      closeScope(scope, stack.at(-1), gaps);
    } else if (character === DYNAMIC) {
      addDynamic(top(stack), stack.length > 1);
    } else {
      top(stack).text += character;
    }
  }
  closeRemaining(stack, gaps);
  return gaps.sort((left, right) => left.index - right.index);
}
