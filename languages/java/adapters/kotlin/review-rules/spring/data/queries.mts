import { annotationIn, argumentOf, isTrue } from '../spring-names.mts';
import { entriesOf, report, symbolOf } from '../spring-scopes.mts';
import { ENTITY_MANAGER } from '../spring-types.mts';
import {
  FLUSHES,
  INHERITED_METHODS,
  JPA_QUERY,
  MODIFYING,
  NATIVE_QUERY,
  QUERY_ANNOTATIONS,
  SUPPRESS,
} from './data-types.mts';
import { entityReceiver, inClearedLoop, repositoryReceiver } from './loops/loop-scopes.mts';
import { rowsInMemory } from './rows/rows.mts';
import type {
  Annotation,
  FunctionFact,
  InvocationFact,
  Reported,
  SpringView,
} from '../typed/spring-shapes.mts';

const QUERIES = new Set([...JPA_QUERY, ...NATIVE_QUERY]);
const POSITIONAL = /\?\d/u;
const STRINGS = /"""[\s\S]*?"""|"(?:[^"\\]|\\.)*"/gu;
const JOINED = /\+|\.plus\(/u;
const TEMPLATE = /(?<=(?:^|[^\\])(?:\\\\)*)\$(?:\{(?!'\$'\})|[\p{L}_])/u;
const NATIVE_MARKER = '"PMD.SpringDataNativeQuery"';
const FILTERS = new Set<string | undefined>([
  'filter',
  'filterNot',
  'count',
  'any',
  'all',
  'none',
  'first',
  'firstOrNull',
  'find',
  'single',
  'singleOrNull',
  'size',
  'isEmpty',
  'isNotEmpty',
  'filterWhen',
  'hasElements',
  'next',
  'take',
  'elementAt',
]);
const COLLECTING = new Set<string | undefined>(['asSequence', 'toList', 'collectList']);
const AWAITING = new Set<string | undefined>(['block', 'awaitSingle', 'awaitFirst']);
const STREAM_FILTERS = new Set<string | undefined>([
  'filter',
  'count',
  'anyMatch',
  'allMatch',
  'noneMatch',
  'findFirst',
  'findAny',
]);

function repositoryFunctions(view: SpringView): FunctionFact[] {
  return view.file.classes
    .filter((declared) => declared.kind === 'interface' && view.isRepository(declared.qualified))
    .flatMap((declared) => view.functionsOf(declared.qualified));
}

function queryOf(view: SpringView, fn: FunctionFact): Annotation | undefined {
  return annotationIn(view.resolve, entriesOf(fn), QUERIES);
}

function derivedQueries(view: SpringView): Reported[] {
  return repositoryFunctions(view)
    .filter((fn) => !(fn.hasBody || INHERITED_METHODS.has(fn.name)))
    .filter((fn) => annotationIn(view.resolve, entriesOf(fn), QUERY_ANNOTATIONS) === undefined)
    .map((fn) => report('SpringDataDerivedQuery', fn, `${fn.owner}.${fn.name}`));
}

function suppressesNative(view: SpringView, entries: Annotation[]): boolean {
  const suppress = annotationIn(view.resolve, entries, SUPPRESS);
  return suppress?.arguments.some(({ text }) => text.includes(NATIVE_MARKER)) === true;
}

function nativeAllowed(view: SpringView, fn: FunctionFact | undefined): boolean {
  return (
    fn !== undefined &&
    (suppressesNative(view, entriesOf(fn)) ||
      suppressesNative(view, view.classes.get(fn.owner)?.annotations ?? []))
  );
}

function nativeQueries(view: SpringView): Reported[] {
  const declared = view.file.functions
    .filter((fn) => {
      const query = annotationIn(view.resolve, entriesOf(fn), JPA_QUERY);
      return (
        annotationIn(view.resolve, entriesOf(fn), NATIVE_QUERY) !== undefined ||
        (query !== undefined && isTrue(argumentOf(query, 'nativeQuery')))
      );
    })
    .filter((fn) => !nativeAllowed(view, fn))
    .map((fn) => report('SpringDataNativeQuery', fn, `${fn.owner}.${fn.name}`));
  const called = view.file.invocations
    .filter(
      (invocation) =>
        invocation.name === 'createNativeQuery' &&
        view.is(view.typeOf(invocation.scope, invocation.receiver), ENTITY_MANAGER),
    )
    .filter((invocation) => !nativeAllowed(view, view.functionAt(invocation.scope)))
    .map((invocation) =>
      report(
        'SpringDataNativeQuery',
        invocation,
        symbolOf(view, invocation.scope, invocation.name),
      ),
    );
  return [...declared, ...called];
}

function queryTexts(query: Annotation): string[] {
  return [argumentOf(query, 'value', { positional: true }), argumentOf(query, 'countQuery')].filter(
    (text) => text !== undefined,
  );
}

function joined(text: string): boolean {
  return (
    JOINED.test(text.replaceAll(STRINGS, '')) ||
    (text.match(STRINGS) ?? []).some((literal) => TEMPLATE.test(literal))
  );
}

function queryAnnotations(view: SpringView): Reported[] {
  return view.file.functions.flatMap((fn) => {
    const query = queryOf(view, fn);
    const modifying = annotationIn(view.resolve, entriesOf(fn), MODIFYING);
    const symbol = `${fn.owner}.${fn.name}`;
    const checks: [string, boolean | undefined][] = [
      ['SpringDataNamedParameters', query?.arguments.some(({ text }) => POSITIONAL.test(text))],
      [
        'SpringDataQueryTextBlock',
        query !== undefined && queryTexts(query).some((text) => joined(text)),
      ],
      [
        'SpringDataModifyingQuery',
        modifying !== undefined &&
          !(
            isTrue(argumentOf(modifying, 'clearAutomatically')) &&
            isTrue(argumentOf(modifying, 'flushAutomatically'))
          ),
      ],
    ];
    return checks
      .filter(([, flagged]) => flagged === true)
      .map(([rule]) => report(rule, fn, symbol));
  });
}

function flushes(view: SpringView): Reported[] {
  return view.file.invocations
    .filter((invocation) => FLUSHES.has(invocation.name) && entityReceiver(view, invocation))
    .filter((invocation) => !inClearedLoop(view, invocation.scope))
    .map((invocation) =>
      report('SpringDataNoFlush', invocation, symbolOf(view, invocation.scope, invocation.name)),
    );
}

function filtersList([first, second]: (string | undefined)[]): boolean {
  return FILTERS.has(first) || (first === 'stream' && STREAM_FILTERS.has(second));
}

function filtersAfterLoad(invocation: InvocationFact): boolean {
  const [first, ...rest] = invocation.after ?? [];
  if (!COLLECTING.has(first)) {
    return filtersList([first, ...rest]);
  }
  const awaited = AWAITING.has(rest[0]) ? rest.slice(1) : rest;
  return filtersList(awaited);
}

function filterInQuery(view: SpringView): Reported[] {
  const loaded = view.file.invocations.filter(
    (invocation) =>
      invocation.name === 'findAll' &&
      invocation.arguments.length === 0 &&
      repositoryReceiver(view, invocation) &&
      filtersAfterLoad(invocation),
  );
  return [
    ...loaded.map((invocation) =>
      report('SpringDataFilterInQuery', invocation, symbolOf(view, invocation.scope, 'findAll')),
    ),
    ...rowsInMemory(view, new Set(loaded)),
  ];
}

export const QUERY_RULES = [
  derivedQueries,
  nativeQueries,
  queryAnnotations,
  flushes,
  filterInQuery,
];
