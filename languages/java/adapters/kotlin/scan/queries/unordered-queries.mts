import { escapeRegExp } from '../typed/typed-scan.mts';
import { sqlOrderGaps } from '../../../../../../shared/rules/queries/sql-order.mjs';
import { lineAt, splitArguments } from '../kotlin-source.mts';
import {
  argumentName,
  argumentText,
  declarationOf,
  functionAround,
  literalText,
  type FunctionScope,
} from './query-scope.mts';
import type { Ruled, Scanned } from '../typed/scan-shapes.mts';

const UNORDERED_RULE = 'UnorderedQuery';

const STATEMENT_START = /^\s*(?:\(\s*)?(?:select|with)\b/iu;
const FIND_ALL_WINDOW = 40;
const PAGE_CALL = /\.\s*(setMaxResults|setFirstResult)\s*\(/g;
const CREATE_CALL = /(?<![\w$])(?:createQuery|createNativeQuery)\s*\(/g;
const ORDERED = /\border\s+by\b/iu;
const COUNT_OR_CONSTANT =
  /^\s*select\s+(?:(?:count|max|min|sum|avg|exists)\s*\(|(?:1|true)(?:\s|$))/iu;
const CRITERIA = /\bcreateQuery\s*\(\s*[\w.]+::class(?:\.java)?\s*\)/u;
const PAGE_REQUEST =
  /(?<![\w$])(?:PageRequest\s*\.\s*of|(?:PageRequest|Pageable)\s*\.\s*ofSize)\s*\(/g;
const DECLARED = /^\s*va[lr]\s+([A-Za-z_]\w*)\s*(?::[^=\n]+)?=/u;
const HELD = /(?<![\w$])va[lr]\s+([A-Za-z_]\w*)\s*(?::\s*\w+\s*)?=\s*$/u;
const FIND_ALL = /findAll\s*$/u;
const RECEIVER = /([A-Za-z_]\w*)\s*$/u;
const CONTINUED = /^\s*\./u;
const QUERY_SETTERS = String.raw`(?:\s*\??\.\s*set\w*\s*\((?:[^()]|\([^()]*\))*\))*`;
const RESULT_LIST = String.raw`^${QUERY_SETTERS}\s*\??\.\s*(?:getResultList\s*\(\s*\)|resultList)`;
const LIST_PROBE = String.raw`(?:isEmpty|isNotEmpty|size|count|any|none)\b`;
const STREAM_TEST = String.raw`(?:count\s*\(|anyMatch\s*[({]|noneMatch\s*[({]|findAny\s*\(\s*\)\s*\.\s*isPresent\b)`;
const STREAM_PROBE = String.raw`stream\s*\(\s*\)\s*\.\s*${STREAM_TEST}`;
const PROBE_CHAIN = new RegExp(
  String.raw`${RESULT_LIST}\s*\??\.\s*(?:${LIST_PROBE}|${STREAM_PROBE})`,
  'u',
);
const HELD_LIST = new RegExp(String.raw`${RESULT_LIST}\s*$`, 'u');
const CHAIN = String.raw`(?:\.\s*\w+\s*\((?:[^()]|\([^()]*\))*\)\s*)`;
const PROBE_USE = /^\s*\??\.\s*(?:isEmpty|isNotEmpty|size)\b/u;
const PROBE_LIMIT = /^[12]$/u;

export const QUERY_ORDER_MESSAGES = {
  [UNORDERED_RULE]:
    'Order on a unique key, or add a tie-breaker after a non-unique key: `order by a.createdAt desc, a.id` in the query text, `criteria.orderBy(...)`, `PageRequest.of(page, size, Sort.by("createdAt", "id"))`, or `json_agg(t.name order by t.name)`. This query takes a page of rows (`setMaxResults`, `setFirstResult`, an unsorted `PageRequest` passed to `findAll`, or SQL `LIMIT`, `OFFSET` or `FETCH`) or builds an `array_agg`/`json_agg` list with no ORDER BY, so which rows come back, and in which order, is up to the database and can change between runs. `setMaxResults(1)` or `LIMIT 1` is fine when the query selects only a constant or a count. `setMaxResults(1)` or `(2)` is fine when the result is only tested with `isEmpty()` or `size()`. An exception fits only a query whose rows come back in one order anyway, or a nested list that is a set whose callers never depend on its order.',
};

function textGaps(scanned: Scanned): number[] {
  return scanned.literals.flatMap((literal) => {
    const text = literalText(literal);
    return STATEMENT_START.test(text) && sqlOrderGaps(text).length > 0 ? [literal.start] : [];
  });
}

function isSingleRow(
  scanned: Scanned,
  name: string,
  open: number,
): { single: boolean; first: boolean; value: string } {
  const argument = splitArguments(scanned.code, open).parts[0];
  const value =
    argument === undefined ? '' : scanned.code.slice(argument.start, argument.end).trim();
  return {
    single: name === 'setMaxResults' && value === '1',
    first: name === 'setFirstResult' && value === '0',
    value,
  };
}

function isProbe(
  scanned: Scanned,
  { match, scope, value }: { match: RegExpExecArray; scope: FunctionScope; value: string },
): boolean {
  if (match[1] !== 'setMaxResults' || !PROBE_LIMIT.test(value)) {
    return false;
  }
  const { code } = scanned;
  const open = match.index + match[0].length - 1;
  const rest = code.slice(splitArguments(code, open).close + 1, statementEnd(code, open));
  if (PROBE_CHAIN.test(rest)) {
    return true;
  }
  const held = DECLARED.exec(code.slice(statementStart(code, match.index), match.index))?.[1];
  if (held === undefined || !HELD_LIST.test(rest)) {
    return false;
  }
  const uses = [
    ...scope.text.matchAll(new RegExp(String.raw`(?<![\w$.])${escapeRegExp(held)}(?![\w$])`, 'gu')),
  ].slice(1);
  return (
    uses.length > 0 &&
    uses.every((use) => PROBE_USE.test(scope.text.slice(use.index + use[0].length)))
  );
}

function statementStart(code: string, offset: number): number {
  const starts = [code.lastIndexOf('\n', offset - 1) + 1];
  for (const start of starts) {
    if (start > 0 && CONTINUED.test(lineAt(code, start))) {
      starts.push(code.lastIndexOf('\n', start - 2) + 1);
    }
  }
  return starts.at(-1) ?? 0;
}

function statementEnd(code: string, offset: number): number {
  const ends = [code.indexOf('\n', offset)];
  for (const end of ends) {
    if (end !== -1 && CONTINUED.test(lineAt(code, end + 1))) {
      ends.push(code.indexOf('\n', end + 1));
    }
  }
  const last = ends.at(-1) ?? -1;
  return last === -1 ? code.length : last;
}

function createdQuery(
  code: string,
  match: RegExpExecArray,
  scope: FunctionScope,
): number | undefined {
  const start = statementStart(code, match.index);
  const chain = [...code.slice(start, match.index).matchAll(CREATE_CALL)].at(-1);
  if (chain !== undefined) {
    return start + chain.index + chain[0].length - 1;
  }
  const held = RECEIVER.exec(code.slice(start, match.index))?.[1];
  const declarations =
    held === undefined
      ? []
      : [
          ...scope.text
            .slice(0, match.index - scope.start)
            .matchAll(
              new RegExp(
                String.raw`(?<![\w$])va[lr]\s+${escapeRegExp(held)}\s*(?::[^=\n]+)?=`,
                'gu',
              ),
            ),
        ];
  const declared = declarations.at(-1);
  if (declared === undefined) {
    return undefined;
  }
  const from = scope.start + declared.index;
  const create = CREATE_CALL.exec(code.slice(from, statementEnd(code, from)));
  CREATE_CALL.lastIndex = 0;
  return create === null ? undefined : from + create.index + create[0].length - 1;
}

function unorderedPage(scanned: Scanned, match: RegExpExecArray): boolean {
  const open = match.index + match[0].length - 1;
  const scope = functionAround(scanned.code, match.index);
  const createOpen = createdQuery(scanned.code, match, scope);
  const { single, first, value } = isSingleRow(scanned, match[1] ?? '', open);
  if (createOpen === undefined || first || isProbe(scanned, { match, scope, value })) {
    return false;
  }
  const text = argumentText(scanned, createOpen, scope);
  if (text !== undefined) {
    return !(ORDERED.test(text) || (single && COUNT_OR_CONSTANT.test(text)));
  }
  const name = argumentName(scanned, createOpen);
  const criteria = name !== undefined && CRITERIA.test(declarationOf(scanned, name, scope) ?? '');
  return (
    criteria &&
    !new RegExp(String.raw`(?<![\w$])${escapeRegExp(name)}\s*${CHAIN}*\.\s*orderBy\s*\(`, 'u').test(
      scope.text,
    )
  );
}

function pageCalls(scanned: Scanned): number[] {
  return [...scanned.code.matchAll(PAGE_CALL)].flatMap((match) =>
    unorderedPage(scanned, match) ? [match.index + match[0].indexOf(match[1] ?? '')] : [],
  );
}

function passedToFindAll(
  code: string,
  offset: number,
  { close, scope }: { close: number; scope: FunctionScope },
): boolean {
  if (/^\s*\.\s*withSort\b/u.test(code.slice(close + 1))) {
    return false;
  }
  const open = enclosingParenBefore(code, offset);
  if (open !== -1 && FIND_ALL.test(code.slice(Math.max(0, open - FIND_ALL_WINDOW), open))) {
    return true;
  }
  const held = HELD.exec(code.slice(code.lastIndexOf('\n', offset) + 1, offset))?.[1];
  const passed = new RegExp(
    String.raw`findAll\s*\([^()]*(?<![\w$])${escapeRegExp(held ?? '')}(?![\w$])(?!\s*\.\s*withSort)`,
    'u',
  );
  return held !== undefined && passed.test(scope.text);
}

function enclosingParenBefore(code: string, offset: number): number {
  const start = Math.max(code.lastIndexOf('\n', offset - 1), code.lastIndexOf(';', offset - 1)) + 1;
  let depth = 0;
  for (const [position, character] of [
    ...Array.from(code.slice(start, offset)).entries(),
  ].toReversed()) {
    if (character === '(' && depth === 0) {
      return start + position;
    }
    depth += Number(character === ')') - Number(character === '(');
  }
  return -1;
}

function unsortedPageRequests(scanned: Scanned): number[] {
  return [...scanned.code.matchAll(PAGE_REQUEST)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const { parts, close } = splitArguments(scanned.code, open);
    const sized = match[0].includes('ofSize') || parts.length === 2;
    const scope = functionAround(scanned.code, match.index);
    return sized && passedToFindAll(scanned.code, match.index, { close, scope })
      ? [match.index]
      : [];
  });
}

export function unorderedQueries(scanned: Scanned): Ruled[] {
  const offsets = [...textGaps(scanned), ...pageCalls(scanned), ...unsortedPageRequests(scanned)];
  return [...new Set(offsets)]
    .toSorted((left, right) => left - right)
    .map((offset) => ({ rule: UNORDERED_RULE, offset }));
}
