import { DYNAMIC } from '../security/sql-text.mjs';

export const PAGE = 'page';
export const AGGREGATE = 'aggregate';

const AGGREGATES = new Set(['array_agg', 'json_agg', 'jsonb_agg']);
const MASKED = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|"(?:[^"]|"")*"|`[^`]*`/gu;
const SELECT = /\bselect\b/u;
const ORDER_BY = /\border\s+by\b/u;
const PAGE_CLAUSE = /\b(?:limit|offset)\b(?:\s+(?:\d+|\u0000))?|\bfetch\s+(?:first|next)\b/u;
const SINGLE_ROW = /\blimit\s+1\b|\bfetch\s+(?:first|next)\s+(?:1\s+)?rows?\b/u;
const SELECTION = /\bselect\s+(?:all\s+|distinct\s+)?([\s\S]*?)(?:\b(?:from|limit|fetch)\b|$)/u;
const CONSTANT_ITEM =
  /^(?:\d+|true|false|null|''|count\s*\(\)|exists\s*\(\)|\u0000)(?:\s+(?:as\s+)?[\w$]+)?$/u;
const VALUE_BEFORE =
  /(?:[=<>!+\-*/%,(|]|\b(?:like|ilike|in|between|and|or|not|is|limit|offset|where|on|having|when|then|else|values|any|all|first|next|by|select|set|distinct))\s*$/u;
const FUNCTION_NAME = /([\w$]+)\s*$/u;

function masked(text) {
  return text.replaceAll(MASKED, (quoted) => (quoted.startsWith("'") ? "''" : 'q')).toLowerCase();
}

function newScope(start, name) {
  return { start, name, text: '', opaque: false, aggregates: [], childOrdered: false };
}

function isOrderedSelect(scope) {
  return SELECT.test(scope.text) && ORDER_BY.test(scope.text);
}

function isConstantSelection(text) {
  const selection = SELECTION.exec(text)?.[1];
  const items = selection === undefined ? [] : selection.split(',').map((item) => item.trim());
  return items.length > 0 && items.every((item) => CONSTANT_ITEM.test(item));
}

function pageGap(scope) {
  const clause = PAGE_CLAUSE.exec(scope.text);
  if (clause === null || scope.opaque || !SELECT.test(scope.text) || ORDER_BY.test(scope.text)) {
    return [];
  }
  const existence = SINGLE_ROW.test(scope.text) && isConstantSelection(scope.text);
  const form = clause[0].replaceAll(DYNAMIC, '?').replaceAll(/\s+/gu, ' ').toUpperCase();
  return existence ? [] : [{ kind: PAGE, form, index: scope.start }];
}

function aggregateGaps(scope) {
  return scope.childOrdered || scope.opaque ? [] : scope.aggregates;
}

function closeScope(stack, gaps) {
  const scope = stack.pop();
  const parent = stack.at(-1);
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

function addDynamic(scope) {
  scope.opaque ||= !VALUE_BEFORE.test(scope.text);
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
      closeScope(stack, gaps);
    } else if (character === DYNAMIC) {
      addDynamic(stack.at(-1));
    } else {
      stack.at(-1).text += character;
    }
  }
  while (stack.length > 0) {
    closeScope(stack, gaps);
  }
  return gaps.sort((left, right) => left.index - right.index);
}
