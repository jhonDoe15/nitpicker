import { annotationIn, argumentOf, isTrue } from '../spring-names.mjs';
import { entriesOf, report, symbolOf } from '../spring-scopes.mjs';
import { ENTITY_MANAGER } from '../spring-types.mjs';
import {
  FLUSHES,
  INHERITED_METHODS,
  JPA_QUERY,
  MODIFYING,
  NATIVE_QUERY,
  QUERY_ANNOTATIONS,
  SUPPRESS,
} from './data-types.mjs';
import { entityReceiver, inClearedLoop, repositoryReceiver } from './loops/loop-scopes.mjs';

const QUERIES = new Set([...JPA_QUERY, ...NATIVE_QUERY]);
const POSITIONAL = /\?\d/u;
const STRINGS = /"""[\s\S]*?"""|"(?:[^"\\]|\\.)*"/gu;
const JOINED = /\+|\.plus\(/u;
const TEMPLATE = /(?<=(?:^|[^\\])(?:\\\\)*)\$(?:\{(?!'\$'\})|[\p{L}_])/u;
const NATIVE_MARKER = '"PMD.SpringDataNativeQuery"';
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
  'single',
  'singleOrNull',
  'size',
  'isEmpty',
  'isNotEmpty',
]);
const STREAM_FILTERS = new Set([
  'filter',
  'count',
  'anyMatch',
  'allMatch',
  'noneMatch',
  'findFirst',
  'findAny',
]);

function repositoryFunctions(view) {
  return view.file.classes
    .filter((declared) => declared.kind === 'interface' && view.isRepository(declared.qualified))
    .flatMap((declared) => view.functionsOf(declared.qualified));
}

function queryOf(view, fn) {
  return annotationIn(view.resolve, entriesOf(fn), QUERIES);
}

function derivedQueries(view) {
  return repositoryFunctions(view)
    .filter((fn) => !fn.hasBody && !INHERITED_METHODS.has(fn.name))
    .filter((fn) => annotationIn(view.resolve, entriesOf(fn), QUERY_ANNOTATIONS) === undefined)
    .map((fn) => report('SpringDataDerivedQuery', fn, `${fn.owner}.${fn.name}`));
}

function suppressesNative(view, entries) {
  const suppress = annotationIn(view.resolve, entries, SUPPRESS);
  return suppress?.arguments.some(({ text }) => text.includes(NATIVE_MARKER)) === true;
}

function nativeAllowed(view, fn) {
  return (
    fn !== undefined &&
    (suppressesNative(view, entriesOf(fn)) ||
      suppressesNative(view, view.classes.get(fn.owner)?.annotations ?? []))
  );
}

function nativeQueries(view) {
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

function queryTexts(query) {
  return [argumentOf(query, 'value', { positional: true }), argumentOf(query, 'countQuery')].filter(
    (text) => text !== undefined,
  );
}

function joined(text) {
  return (
    JOINED.test(text.replaceAll(STRINGS, '')) ||
    (text.match(STRINGS) ?? []).some((literal) => TEMPLATE.test(literal))
  );
}

function queryAnnotations(view) {
  return view.file.functions.flatMap((fn) => {
    const query = queryOf(view, fn);
    const modifying = annotationIn(view.resolve, entriesOf(fn), MODIFYING);
    const symbol = `${fn.owner}.${fn.name}`;
    const checks = [
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

function flushes(view) {
  return view.file.invocations
    .filter((invocation) => FLUSHES.has(invocation.name) && entityReceiver(view, invocation))
    .filter((invocation) => !inClearedLoop(view, invocation.scope))
    .map((invocation) =>
      report('SpringDataNoFlush', invocation, symbolOf(view, invocation.scope, invocation.name)),
    );
}

function filtersAfterLoad(invocation) {
  const [first, second] = invocation.after ?? [];
  return (
    FILTERS.has(first) ||
    (first === 'stream' && STREAM_FILTERS.has(second)) ||
    (first === 'asSequence' && FILTERS.has(second))
  );
}

function filterInQuery(view) {
  return view.file.invocations
    .filter(
      (invocation) =>
        invocation.name === 'findAll' &&
        invocation.arguments.length === 0 &&
        repositoryReceiver(view, invocation) &&
        filtersAfterLoad(invocation),
    )
    .map((invocation) =>
      report('SpringDataFilterInQuery', invocation, symbolOf(view, invocation.scope, 'findAll')),
    );
}

export const QUERY_RULES = [
  derivedQueries,
  nativeQueries,
  queryAnnotations,
  flushes,
  filterInQuery,
];
