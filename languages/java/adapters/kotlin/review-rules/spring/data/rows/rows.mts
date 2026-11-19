import { typeArguments, typeName } from '../../spring-names.mts';
import { report, symbolOf } from '../../spring-scopes.mts';
import { normalized } from '../../view/expressions.mts';
import { elementOf, isCollectionType, isMapType, simpleName } from '../../view/member-types.mts';
import { repositoryReceiver } from '../loops/loop-scopes.mts';
import { comparatorReadsColumns, keyReadsColumns } from './column-reads.mts';
import type { Argument, InvocationFact, Reported, SpringView } from '../../typed/spring-shapes.mts';

const RULE = 'SpringDataFilterInQuery';
const NOT_QUERIES = /^(?:save|delete|remove|count|exists|flush)(?:\p{Lu}|$)/u;
const LIMITED = /^[a-z]+(?:First|Top)\d*(?:By|$)/u;
const STREAMS = new Set(['Flux', 'Flow']);
const BOUNDS = new Set(['Pageable', 'PageRequest', 'Limit']);
const PAGES = new Set(['Page', 'Slice']);
const PASSING = new Set(['toList', 'asSequence', 'collectList', 'block', 'awaitSingle', 'content']);
const SIZES = new Set<string | undefined>(['size', 'isEmpty', 'isNotEmpty', 'hasElements']);
const EMPTY_ONLY = new Set<string | undefined>(['count', 'none', 'any']);
const FILTERS = new Set<string | undefined>([
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
const KEYS = new Set<string | undefined>([
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
const COMPARATORS = new Set<string | undefined>(['sortedWith', 'sort']);
type Rows = { entity: string | undefined; bounded: boolean };
type Operation = {
  step: string | undefined;
  next: string | undefined;
  call: InvocationFact | undefined;
  argument: Argument | undefined;
  bounded: boolean;
};

const FOLLOWED = new Map<string | undefined, Set<string | undefined>>([
  ['groupingBy', new Set(['eachCount'])],
  ['map', new Set(['sum', 'average', 'max', 'min', 'maxOrNull', 'minOrNull'])],
]);
const CHAIN_LIMIT = 20;

function resultOf(view: SpringView, invocation: InvocationFact): string | undefined {
  const args = invocation.arguments.map(({ text }) => text).join(', ');
  return view.typeOf(
    invocation.scope,
    `${String(invocation.receiver)}.${invocation.name}(${args})`,
  );
}

function repositoryEntity(view: SpringView, invocation: InvocationFact): string | undefined {
  const found = view.projectClass(
    typeName(view.typeOf(invocation.scope, invocation.receiver) ?? ''),
  );
  const written = (found?.declared.genericSupers ?? []).find((text) =>
    simpleName(text).endsWith('Repository'),
  );
  return written === undefined ? undefined : typeArguments(written)[0];
}

function rowsOf(view: SpringView, invocation: InvocationFact): Rows | undefined {
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

function stepCall(
  view: SpringView,
  { invocation, steps, index }: { invocation: InvocationFact; steps: string[]; index: number },
): InvocationFact | undefined {
  const previous = index === 0 ? invocation.name : steps[index - 1];
  return view.file.invocations.find(
    (candidate) =>
      candidate.scope === invocation.scope &&
      candidate.name === steps[index] &&
      candidate.line >= invocation.line &&
      candidate.line <= invocation.line + CHAIN_LIMIT &&
      (candidate.receiver ?? '').includes(`${invocation.name}(`) &&
      (candidate.previous?.name === previous ||
        normalized(candidate.receiver).endsWith(`.${String(previous)}`)),
  );
}

function operationOf(
  view: SpringView,
  invocation: InvocationFact,
  rows: Rows,
): Operation | undefined {
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

function readsRows(
  view: SpringView,
  entity: string,
  { step, next, argument, bounded }: Operation,
): boolean {
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

function inMemory(view: SpringView, invocation: InvocationFact, rows: Rows): boolean {
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

export function rowsInMemory(view: SpringView, reported: Set<InvocationFact>): Reported[] {
  return view.file.invocations
    .filter((invocation) => !reported.has(invocation))
    .map((invocation) => ({ invocation, rows: rowsOf(view, invocation) }))
    .filter(({ invocation, rows }) => rows !== undefined && inMemory(view, invocation, rows))
    .map(({ invocation }) =>
      report(RULE, invocation, symbolOf(view, invocation.scope, invocation.name)),
    );
}
