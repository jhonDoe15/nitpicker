import { selectorsAfter } from '../../syntax/expressions/kotlin-chains.mjs';
import { defineRule, hitOn, memberSymbolOf } from '../rule-support.mjs';
import { functionContexts, persistenceCalls } from './persistence-calls.mjs';

const FILTERS = new Set([
  'filter',
  'filterNot',
  'count',
  'any',
  'all',
  'none',
  'first',
  'firstOrNull',
  'find',
  'singleOrNull',
  'anyMatch',
  'allMatch',
  'noneMatch',
  'findFirst',
  'findAny',
  'size',
  'isEmpty',
  'isNotEmpty',
]);
const HOPS = new Set(['stream', 'parallelStream', 'asSequence']);

function filtersInMemory(names) {
  const [first, second] = names;
  return FILTERS.has(first) || (HOPS.has(first) && FILTERS.has(second));
}

const filterInQuery = defineRule(
  'SpringDataFilterInQuery',
  'Filter and count in the database, with an @Query that has a where clause, a count query or an exists query, instead of loading the whole table with findAll().',
  (file, project) =>
    functionContexts(file).flatMap((context) =>
      persistenceCalls({ context, targets: project.repositoryTypes, names: new Set(['findAll']) })
        .filter((call) => !call.reference && call.arguments.length === 0)
        .filter((call) => filtersInMemory(selectorsAfter(file.source, call)))
        .map((call) => hitOn(call.node, `${memberSymbolOf(context.scope.fn)}@findAll`)),
    ),
);

export const FILTER_IN_QUERY_RULES = [filterInQuery];
