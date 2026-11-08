import { sqlOrderGaps } from '../../../../../../shared/rules/queries/sql-order.mjs';
import { splitArguments } from '../kotlin-source.mjs';
import { argumentName, argumentText, declarationOf, functionAround, literalText } from './query-scope.mjs';

export const UNORDERED_RULE = 'UnorderedQuery';

const STATEMENT_START = /^\s*\(?\s*(?:select|with)\b/iu;
const PAGE_CALL = /\.\s*(setMaxResults|setFirstResult)\s*\(/g;
const CREATE_CALL = /(?<![\w$])(?:createQuery|createNativeQuery)\s*\(/g;
const ORDERED = /\border\s+by\b/iu;
const COUNT_OR_CONSTANT = /^\s*select\s+(?:count\s*\(|1\s|true\s)/iu;
const CRITERIA = /\bcreateQuery\s*\(\s*[\w.]+::class(?:\.java)?\s*\)/u;
const PAGE_REQUEST = /(?<![\w$])(?:PageRequest\s*\.\s*of|(?:PageRequest|Pageable)\s*\.\s*ofSize)\s*\(/g;
const HELD = /(?<![\w$])va[lr]\s+([A-Za-z_]\w*)\s*(?::\s*\w+\s*)?=\s*$/u;
const FIND_ALL = /findAll\s*$/u;

export const QUERY_ORDER_MESSAGES = {
  [UNORDERED_RULE]:
    'Order on a unique key, or add a tie-breaker after a non-unique key: `order by a.createdAt desc, a.id` in the query text, `criteria.orderBy(...)`, `PageRequest.of(page, size, Sort.by("createdAt", "id"))`, or `json_agg(t.name order by t.name)`. This query takes a page of rows (`setMaxResults`, `setFirstResult`, an unsorted `PageRequest` passed to `findAll`, or SQL `LIMIT`, `OFFSET` or `FETCH`) or builds an `array_agg`/`json_agg` list with no ORDER BY, so which rows come back, and in which order, is up to the database and can change between runs. `setMaxResults(1)` or `LIMIT 1` is fine when the query selects only a constant or a count. An exception fits only a query whose rows come back in one order anyway, or a nested list that is a set whose callers never depend on its order.',
};

function textGaps(scanned) {
  return scanned.literals.flatMap((literal) => {
    const text = literalText(literal);
    return STATEMENT_START.test(text) && sqlOrderGaps(text).length > 0 ? [literal.start] : [];
  });
}

function isSingleRow(scanned, name, open) {
  const argument = splitArguments(scanned.code, open).parts[0];
  const value = argument === undefined ? '' : scanned.code.slice(argument.start, argument.end).trim();
  return { single: name === 'setMaxResults' && value === '1', first: name === 'setFirstResult' && value === '0' };
}

function unorderedPage(scanned, match) {
  const open = match.index + match[0].length - 1;
  const scope = functionAround(scanned.code, match.index);
  const creates = [...scope.text.slice(0, match.index - scope.start).matchAll(CREATE_CALL)];
  const create = creates.at(-1);
  if (create === undefined) {
    return false;
  }
  const createOpen = scope.start + create.index + create[0].length - 1;
  const { single, first } = isSingleRow(scanned, match[1], open);
  const text = argumentText(scanned, createOpen);
  if (first) {
    return false;
  }
  if (text !== undefined) {
    return !ORDERED.test(text) && !(single && COUNT_OR_CONSTANT.test(text));
  }
  const name = argumentName(scanned, createOpen);
  const criteria = name !== undefined && CRITERIA.test(declarationOf(scanned, name) ?? '');
  return criteria && !/\.\s*orderBy\s*\(/u.test(scope.text);
}

function pageCalls(scanned) {
  return [...scanned.code.matchAll(PAGE_CALL)].flatMap((match) =>
    unorderedPage(scanned, match) ? [match.index + match[0].indexOf(match[1])] : [],
  );
}

function passedToFindAll(code, offset, scope) {
  const open = enclosingParenBefore(code, offset);
  if (open !== -1 && FIND_ALL.test(code.slice(Math.max(0, open - 40), open))) {
    return true;
  }
  const held = HELD.exec(code.slice(code.lastIndexOf('\n', offset) + 1, offset))?.[1];
  return held !== undefined && new RegExp(String.raw`findAll\s*\([^()]*(?<![\w$])${held}(?![\w$])`, 'u').test(scope.text);
}

function enclosingParenBefore(code, offset) {
  let depth = 0;
  for (let index = offset - 1; index >= 0 && code[index] !== '\n' && code[index] !== ';'; index -= 1) {
    if (code[index] === ')') {
      depth += 1;
    } else if (code[index] === '(') {
      if (depth === 0) {
        return index;
      }
      depth -= 1;
    }
  }
  return -1;
}

function unsortedPageRequests(scanned) {
  return [...scanned.code.matchAll(PAGE_REQUEST)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const sized = match[0].includes('ofSize') || splitArguments(scanned.code, open).parts.length === 2;
    const scope = functionAround(scanned.code, match.index);
    return sized && passedToFindAll(scanned.code, match.index, scope) ? [match.index] : [];
  });
}

export function unorderedQueries(scanned) {
  const offsets = [...textGaps(scanned), ...pageCalls(scanned), ...unsortedPageRequests(scanned)];
  return [...new Set(offsets)].toSorted((left, right) => left - right).map((offset) => ({ rule: UNORDERED_RULE, offset }));
}
