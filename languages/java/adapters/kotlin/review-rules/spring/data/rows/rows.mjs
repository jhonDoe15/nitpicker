import { typeArguments, typeName } from '../../spring-names.mjs';
import { report, symbolOf } from '../../spring-scopes.mjs';
import { normalized } from '../../view/expressions.mjs';
import { elementOf, isCollectionType, isMapType, simpleName } from '../../view/member-types.mjs';
import { repositoryReceiver } from '../loops/loop-scopes.mjs';
import { comparatorReadsColumns, keyReadsColumns } from './column-reads.mjs';

const RULE = 'SpringDataFilterInQuery';
const NOT_QUERIES = /^(?:save|delete|remove|count|exists|flush)(?:\p{Lu}|$)/u;
const LIMITED = /^[a-z]+(?:First|Top)\d*(?:By|$)/u;
const STREAMS = new Set(['Flux', 'Flow']);
const BOUNDS = new Set(['Pageable', 'PageRequest', 'Limit']);
const PAGES = new Set(['Page', 'Slice']);
const PASSING = new Set(['toList', 'asSequence', 'collectList', 'block', 'awaitSingle', 'content']);
const SIZES = new Set(['size', 'isEmpty', 'isNotEmpty', 'hasElements']);
const EMPTY_ONLY = new Set(['count', 'none', 'any']);
const FILTERS = new Set([
  'filter',
  'filterNot',
  'any',
  'all',
  'none',
  'count',
  'first',
  'firstOrNull',
  'find',
  'single',
  'singleOrNull',
  'last',
  'lastOrNull',
]);
const KEYS = new Set([
  'sortedBy',
  'sortedByDescending',
  'sumOf',
  'maxOf',
  'minOf',
  'maxOfOrNull',
  'minOfOrNull',
  'maxBy',
  'minBy',
  'maxByOrNull',
  'minByOrNull',
]);
const COMPARATORS = new Set(['sortedWith', 'sort']);
const FOLLOWED = new Map([
  ['groupingBy', new Set(['eachCount'])],
  ['map', new Set(['sum', 'average', 'max', 'min', 'maxOrNull', 'minOrNull'])],
]);
const CHAIN_LIMIT = 20;

function resultOf(view, invocation) {
  const args = invocation.arguments.map(({ text }) => text).join(', ');
  return view.typeOf(invocation.scope, `${invocation.receiver}.${invocation.name}(${args})`);
}

function repositoryEntity(view, invocation) {
  const found = view.projectClass(
    typeName(view.typeOf(invocation.scope, invocation.receiver) ?? ''),
  );
  const written = (found?.declared.genericSupers ?? []).find((text) =>
    simpleName(text).endsWith('Repository'),
  );
  return written === undefined ? undefined : typeArguments(written)[0];
}

function rowsOf(view, invocation) {
  if (NOT_QUERIES.test(invocation.name) || !repositoryReceiver(view, invocation)) {
    return undefined;
  }
  const type = resultOf(view, invocation);
  if (
    type === undefined ||
    isMapType(type) ||
    !(isCollectionType(type) || STREAMS.has(simpleName(type)))
  ) {
    return undefined;
  }
  const element = elementOf(type);
  const entity =
    element === undefined || element === 'Any' ? repositoryEntity(view, invocation) : element;
  const bounded =
    LIMITED.test(invocation.name) ||
    PAGES.has(simpleName(type)) ||
    invocation.arguments.some(({ text }) =>
      BOUNDS.has(simpleName(view.typeOf(invocation.scope, text) ?? '')),
    );
  return { entity, bounded };
}

function stepCall(view, { invocation, steps, index }) {
  const previous = index === 0 ? invocation.name : steps[index - 1];
  return view.file.invocations.find(
    (candidate) =>
      candidate.scope === invocation.scope &&
      candidate.name === steps[index] &&
      candidate.line >= invocation.line &&
      candidate.line <= invocation.line + CHAIN_LIMIT &&
      (candidate.receiver ?? '').includes(`${invocation.name}(`) &&
      (candidate.previous?.name === previous ||
        normalized(candidate.receiver).endsWith(`.${previous}`)),
  );
}

function operationOf(view, invocation, rows) {
  const steps = invocation.after ?? [];
  const index = steps.findIndex((step) => !PASSING.has(step));
  if (index < 0) {
    return undefined;
  }
  const call = stepCall(view, { invocation, steps, index });
  return {
    step: steps[index],
    next: steps[index + 1],
    call,
    argument: call?.arguments[0],
    bounded: rows.bounded || steps.slice(0, index).includes('content'),
  };
}

function readsRows(view, entity, { step, next, argument, bounded }) {
  if (FILTERS.has(step)) {
    return keyReadsColumns(view, entity, argument);
  }
  if (bounded) {
    return false;
  }
  if (COMPARATORS.has(step)) {
    return comparatorReadsColumns(view, entity, argument);
  }
  const keyed = KEYS.has(step) || FOLLOWED.get(step)?.has(next) === true;
  return keyed && keyReadsColumns(view, entity, argument);
}

function inMemory(view, invocation, rows) {
  const operation = operationOf(view, invocation, rows);
  if (operation === undefined) {
    return false;
  }
  const { step, call, argument, bounded } = operation;
  if (SIZES.has(step) || (EMPTY_ONLY.has(step) && call !== undefined && argument === undefined)) {
    return !bounded;
  }
  return (
    rows.entity !== undefined && argument !== undefined && readsRows(view, rows.entity, operation)
  );
}

export function rowsInMemory(view, reported) {
  return view.file.invocations
    .filter((invocation) => !reported.has(invocation))
    .map((invocation) => ({ invocation, rows: rowsOf(view, invocation) }))
    .filter(({ invocation, rows }) => rows !== undefined && inMemory(view, invocation, rows))
    .map(({ invocation }) =>
      report(RULE, invocation, symbolOf(view, invocation.scope, invocation.name)),
    );
}
