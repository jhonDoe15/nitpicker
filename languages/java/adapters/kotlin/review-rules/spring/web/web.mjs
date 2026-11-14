import { annotationIn, simpleTypeName, typeArguments } from '../spring-names.mjs';
import { has, report, returnTypeOf } from '../spring-scopes.mjs';
import {
  CONTROLLER,
  CROSS_ORIGIN,
  EXCEPTION_HANDLER,
  MAPPINGS,
  REQUEST_BODY,
  REQUEST_MAPPING,
  RESPONSE_BODY,
  REST_CONTROLLER,
  VALID,
} from '../spring-types.mjs';

const JSON_NODES = new Set([
  'com.fasterxml.jackson.databind.JsonNode',
  'com.fasterxml.jackson.databind.node.ObjectNode',
  'tools.jackson.databind.JsonNode',
  'tools.jackson.databind.node.ObjectNode',
]);
const ANY = new Set(['kotlin.Any', 'java.lang.Object']);
const MAPS = new Set(['Map', 'MutableMap', 'HashMap', 'LinkedHashMap', 'TreeMap', 'SortedMap']);
const WRAPPERS = new Set([
  'List',
  'MutableList',
  'Collection',
  'MutableCollection',
  'Iterable',
  'Set',
  'MutableSet',
  'Sequence',
  'Array',
  'Optional',
  'ResponseEntity',
  'HttpEntity',
  'CompletableFuture',
  'CompletionStage',
  'Mono',
  'Flux',
  'Flow',
  'Publisher',
  'Deferred',
]);
const BODIES = new Set(['ResponseEntity', 'HttpEntity']);
const SCALARS = new Set([
  'String',
  'CharSequence',
  'Int',
  'Long',
  'Short',
  'Byte',
  'Double',
  'Float',
  'Number',
  'BigDecimal',
  'BigInteger',
  'Boolean',
  'Any',
  'InputStream',
  'Resource',
  'JsonNode',
  'ObjectNode',
  'ByteArray',
]);
const STAR = '*';

function leaf(view, type) {
  if (type === STAR || view.is(type, ANY) || view.is(type, JSON_NODES)) {
    return true;
  }
  if (!MAPS.has(simpleTypeName(type))) {
    return false;
  }
  const [, value] = typeArguments(type);
  return value === undefined || value === STAR || view.is(value, ANY);
}

function inner(type) {
  const name = simpleTypeName(type);
  if (MAPS.has(name)) {
    return typeArguments(type).slice(1);
  }
  return WRAPPERS.has(name) ? typeArguments(type) : [];
}

function untyped(view, type) {
  return (
    leaf(view, type) ||
    (BODIES.has(simpleTypeName(type)) && typeArguments(type).length === 0) ||
    inner(type).some(
      (argument) => leaf(view, argument) || inner(argument).some((nested) => leaf(view, nested)),
    )
  );
}

function plainBody(type) {
  const name = simpleTypeName(type);
  if (SCALARS.has(name) || MAPS.has(name) || name.endsWith('Array')) {
    return true;
  }
  const argumentsOf = typeArguments(type);
  return (
    WRAPPERS.has(name) &&
    argumentsOf.some(
      (argument) =>
        argument === STAR ||
        SCALARS.has(simpleTypeName(argument)) ||
        MAPS.has(simpleTypeName(argument)),
    )
  );
}

function handlers(view) {
  return view.file.functions.filter(
    (fn) => has(view, fn, MAPPINGS) || has(view, fn, EXCEPTION_HANDLER),
  );
}

function mappings(view) {
  const composed = view.file.functions
    .filter((fn) => has(view, fn, REQUEST_MAPPING))
    .map((fn) => report('SpringComposedMapping', fn, `${fn.owner}.${fn.name}`));
  const responseBodies = view.file.classes.flatMap((declared) => {
    const rest = annotationIn(view.resolve, declared.annotations, REST_CONTROLLER) !== undefined;
    const controller = annotationIn(view.resolve, declared.annotations, CONTROLLER) !== undefined;
    const onClass = annotationIn(view.resolve, declared.annotations, RESPONSE_BODY) !== undefined;
    const onFunctions = rest
      ? view.functionsOf(declared.qualified).filter((fn) => has(view, fn, RESPONSE_BODY))
      : [];
    return [
      ...((rest || controller) && onClass
        ? [report('SpringRestController', declared, declared.qualified)]
        : []),
      ...onFunctions.map((fn) => report('SpringRestController', fn, `${fn.owner}.${fn.name}`)),
    ];
  });
  const crossOrigins = [
    ...view.file.classes
      .filter((declared) => annotationIn(view.resolve, declared.annotations, CROSS_ORIGIN))
      .map((declared) => report('SpringNoCrossOrigin', declared, declared.qualified)),
    ...view.file.functions
      .filter((fn) => has(view, fn, CROSS_ORIGIN))
      .map((fn) => report('SpringNoCrossOrigin', fn, `${fn.owner}.${fn.name}`)),
  ];
  return [...composed, ...responseBodies, ...crossOrigins];
}

function requestBodies(view) {
  return view.file.functions.flatMap((fn) =>
    fn.parameters
      .filter((parameter) => has(view, parameter, REQUEST_BODY))
      .flatMap((parameter) => {
        const symbol = `${fn.owner}.${fn.name}.${parameter.name}`;
        if (untyped(view, parameter.type)) {
          return [report('SpringTypedRequestBody', parameter, symbol)];
        }
        return has(view, parameter, VALID) || plainBody(parameter.type)
          ? []
          : [report('SpringValidRequestBody', parameter, symbol)];
      }),
  );
}

function responses(view) {
  const handlerSet = new Set(handlers(view));
  const typed = [...handlerSet]
    .filter((fn) => {
      const type = returnTypeOf(view, fn);
      return type !== undefined && untyped(view, type);
    })
    .map((fn) => report('SpringTypedResponse', fn, `${fn.owner}.${fn.name}`));
  const nulls = view.file.nullReturns
    .filter(({ scope }) => handlerSet.has(view.functionAt(scope)))
    .map((site) => {
      const fn = view.functionAt(site.scope);
      return report('SpringTypedResponse', site, `${fn.owner}.${fn.name}:null`);
    });
  return [...typed, ...nulls];
}

export const WEB_RULES = [mappings, requestBodies, responses];
