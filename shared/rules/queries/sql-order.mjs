import { DYNAMIC } from '../security/sql-text.mjs';

const PAGE = 'page';
export const AGGREGATE = 'aggregate';

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
];
VALUE_WORDS.push(
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
);
VALUE_WORDS.push('distinct');
const VALUE_BEFORE = new RegExp(
  String.raw`(?:[=<>!+\-*/%,(|]|\b(?:${VALUE_WORDS.join('|')}))\s*$`,
  'u',
);
const FUNCTION_NAME = /([\w$]+)\s*$/u;
const EXISTS = 'exists';

function masked(text) {
  return text.replaceAll(MASKED, (quoted) => (quoted.startsWith("'") ? "''" : 'q')).toLowerCase();
}

function newScope(start, name) {
  return { start, name, text: '', opaque: false, aggregates: [], childOrdered: false };
}

function isOrderedSelect(scope) {
  return SELECT.test(scope.text) && ORDER_BY.test(scope.text);
}

function selectionOf(text) {
  const start = SELECT_START.exec(text);
  if (start === null) {
    return undefined;
  }
  const rest = text.slice(start.index + start[0].length).replace(MODIFIER, '');
  const end = rest.search(SELECTION_END);
  return end === -1 ? rest : rest.slice(0, end);
}

function isConstantSelection(text) {
  const selection = selectionOf(text);
  const items = selection === undefined ? [] : selection.split(',').map((item) => item.trim());
  return items.length > 0 && items.every((item) => CONSTANT_ITEM.test(item));
}

function isUnorderedSelect(scope) {
  const { text } = scope;
  return (
    !scope.opaque &&
    scope.name !== EXISTS &&
    SELECT.test(text) &&
    FROM.test(text) &&
    !ORDER_BY.test(text)
  );
}

function pageGap(scope) {
  const clause = PAGE_CLAUSE.exec(scope.text);
  if (clause === null || !isUnorderedSelect(scope)) {
    return [];
  }
  const existence = SINGLE_ROW.test(scope.text) && isConstantSelection(scope.text);
  const form = clause[0].replaceAll(DYNAMIC, '?').replaceAll(/\s+/gu, ' ').toUpperCase();
  return existence ? [] : [{ kind: PAGE, form, index: scope.start }];
}

function aggregateGaps(scope) {
  return scope.childOrdered || scope.opaque ? [] : scope.aggregates;
}

function closeScope(scope, parent, gaps) {
  gaps.push(...pageGap(scope), ...aggregateGaps(scope));
  if (parent === undefined) {
    return;
  }
  parent.text += '()';
  parent.opaque ||= scope.opaque && !SELECT.test(scope.text);
  parent.childOrdered ||= isOrderedSelect(scope);
  const unordered = AGGREGATES.has(scope.name) && !scope.opaque && !ORDER_BY.test(scope.text);
  if (unordered) {
    parent.aggregates.push({ kind: AGGREGATE, form: `${scope.name}(...)`, index: scope.start });
  }
}

function openScope(stack, index) {
  const scope = stack.at(-1);
  const name = FUNCTION_NAME.exec(scope.text)?.[1] ?? '';
  stack.push(newScope(index, name));
}

function addDynamic(scope, nested) {
  scope.opaque ||= !VALUE_BEFORE.test(scope.text) && !(nested && scope.text.trim() === '');
  scope.text += DYNAMIC;
}

/**
 * The places in SQL text whose row order is undefined: a SELECT with LIMIT, OFFSET or FETCH and no
 * ORDER BY at the same level, and an array_agg, json_agg or jsonb_agg call with no ORDER BY inside.
 * `DYNAMIC` marks an interpolated value; one that could be a clause hides the level it sits in.
 */
export function sqlOrderGaps(text) {
  const source = masked(text);
  const stack = [newScope(0, '')];
  const gaps = [];
  for (const [index, character] of [...source].entries()) {
    if (character === '(') {
      openScope(stack, index);
    } else if (character === ')' && stack.length > 1) {
      const scope = stack.pop();
      closeScope(scope, stack.at(-1), gaps);
    } else if (character === DYNAMIC) {
      addDynamic(stack.at(-1), stack.length > 1);
    } else {
      stack.at(-1).text += character;
    }
  }
  for (const [depth, scope] of [...stack.entries()].toReversed()) {
    closeScope(scope, stack[depth - 1], gaps);
  }
  return gaps.sort((left, right) => left.index - right.index);
}
