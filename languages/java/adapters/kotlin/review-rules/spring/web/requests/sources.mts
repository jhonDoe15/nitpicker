import { simpleTypeName, typeArguments, typeName } from '../../spring-names.mts';
import { has, managed } from '../../spring-scopes.mts';
import { SERVLET_REQUESTS, VALUE } from '../../spring-types.mts';
import type { ScopeFact, SpringView } from '../../typed/spring-shapes.mts';
import type { Direct, Seed, SeedParameter, Taint } from '../../typed/request-types.mts';

export const DIRECT: Direct = Object.freeze({ direct: true });
const TEXT = /^(?:(?:kotlin\.)?(?:String|CharSequence)|(?:java\.net\.)?(?:URI|URL))$/u;
const VALUE_TYPES =
  /^(?:kotlin\.)?(?:Int|Long|Short|Byte|Double|Float|Boolean|Char|Unit|Number|UInt|ULong)$/u;
const COLLECTIONS = new Set([
  'List',
  'MutableList',
  'Collection',
  'MutableCollection',
  'Set',
  'MutableSet',
  'Iterable',
  'Sequence',
  'Array',
]);
const MAPS = new Set([
  'Map',
  'MutableMap',
  'HashMap',
  'LinkedHashMap',
  'MultiValueMap',
  'LinkedMultiValueMap',
]);
const URL_NAMED = /url|uri|href|host|endpoint|address|target|location|link|callback|origin/iu;
const REQUEST_GETTERS = new Set([
  'getParameter',
  'getParameterValues',
  'getHeader',
  'getHeaders',
  'getQueryString',
  'queryString',
]);
const MAP_GETTERS = new Set(['get', 'getFirst', 'getValue', 'getOrDefault', 'getOrElse']);

function isText(type: string | undefined): boolean {
  return (
    TEXT.test(typeName(type)) ||
    (COLLECTIONS.has(simpleTypeName(type)) && TEXT.test(typeName(typeArguments(type)[0])))
  );
}

function isValueType(type: string | undefined): boolean {
  return VALUE_TYPES.test(typeName(type));
}

export function sourceKind(view: SpringView, parameter: SeedParameter): Taint | undefined {
  if (has(view, parameter, VALUE)) {
    return undefined;
  }
  const type = (parameter.type ?? '').replaceAll(/\s+/gu, '');
  if (isText(type)) {
    return DIRECT;
  }
  return type === '' || isValueType(type) || type.includes('->') ? undefined : { type };
}

export function memberTainted(view: SpringView, type: string, member: string): boolean {
  const memberType = view.memberTypeOf(type, member);
  if (memberType !== undefined && isValueType(memberType)) {
    return false;
  }
  if (URL_NAMED.test(member) || (memberType !== undefined && isText(memberType))) {
    return true;
  }
  if (view.is(type, SERVLET_REQUESTS)) {
    return REQUEST_GETTERS.has(member);
  }
  return (
    MAPS.has(simpleTypeName(type)) && MAP_GETTERS.has(member) && isText(typeArguments(type).at(-1))
  );
}

function seedsOf(view: SpringView, scope: ScopeFact, parameters: SeedParameter[]): Seed[] {
  return parameters.flatMap((parameter) => {
    const kind = sourceKind(view, parameter);
    return kind === undefined ? [] : [{ key: `${String(scope.id)}:${parameter.name}`, kind }];
  });
}

function functionSeeds(view: SpringView, scope: ScopeFact): Seed[] {
  const fn = view.functionOf(scope);
  if (fn === undefined || fn.visibility === 'private' || fn.local) {
    return [];
  }
  if (fn.name === '<init>' && managed(view, view.classAt(scope.id))) {
    return [];
  }
  const receiver = fn.receiver === undefined ? [] : [{ name: 'this', type: fn.receiver }];
  return seedsOf(view, scope, [...fn.parameters, ...receiver]);
}

export function seeds(view: SpringView): Seed[] {
  return view.file.scopes.flatMap((scope) => {
    if (scope.k === 'fun') {
      return functionSeeds(view, scope);
    }
    const declared = scope.k === 'class' ? view.classes.get(scope.qualified ?? '') : undefined;
    return declared === undefined || managed(view, declared)
      ? []
      : seedsOf(view, scope, declared.primaryParameters);
  });
}
