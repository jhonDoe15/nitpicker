import { typeArguments, typeName } from '../spring-names.mjs';
import { BEAN_FACTORIES } from '../spring-types.mjs';

const THIS = /^this\./u;
const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const DOTTED = /^[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)+$/u;
const CHUNKED = /\.(?:chunked|windowed)\([^()]*\)$/u;
const RECEIVER_HOSTS = new Set(['apply', 'run', 'with']);
const IT_HOSTS = new Set(['let', 'also', 'takeIf', 'takeUnless']);
const MAPS = new Set(['Map', 'MutableMap', 'HashMap', 'LinkedHashMap', 'TreeMap', 'SortedMap']);
const MAP_VIEWS = new Set(['values', 'keys', 'entries']);
const DEPTH = 6;
const BOUNDARIES = new Set(['fun', 'class', 'object']);

function lambdaReceiver(scope) {
  if (!RECEIVER_HOSTS.has(scope.host)) {
    return undefined;
  }
  const text = scope.host === 'with' ? scope.argument : scope.qualifier;
  return text === undefined || text === 'this' ? undefined : { text, scope: scope.parent };
}

export function implicitReceiver(view, scopeId) {
  const chain = view.chain(scopeId);
  const end = chain.findIndex(({ k }) => BOUNDARIES.has(k));
  const inner = end < 0 ? chain : chain.slice(0, end);
  const receiver = inner
    .filter(({ k }) => k === 'lambda')
    .map((scope) => lambdaReceiver(scope))
    .find((found) => found !== undefined);
  if (receiver !== undefined) {
    return receiver;
  }
  const owner = chain[end];
  const extended = owner?.k === 'fun' ? view.functionOf(owner)?.receiver : undefined;
  return extended === undefined ? undefined : { type: extended };
}

function itScope(view, scopeId) {
  return view
    .chain(scopeId)
    .find(({ k, params }) => (k === 'lambda' && params === undefined) || k === 'fun');
}

export function receiverOf(view, invocation) {
  const { receiver, scope } = invocation;
  if (receiver === undefined || receiver === 'this') {
    const implicit = implicitReceiver(view, scope);
    return implicit?.text === undefined ? undefined : implicit;
  }
  const lambda = receiver === 'it' ? itScope(view, scope) : undefined;
  return lambda?.k === 'lambda' && IT_HOSTS.has(lambda.host) && lambda.qualifier !== undefined
    ? { text: lambda.qualifier, scope: lambda.parent }
    : { text: receiver, scope };
}

export function declaresLocally(view, id, name) {
  for (const scope of view.chain(id)) {
    if (scope.k === 'class' || scope.k === 'object') {
      return false;
    }
    const declared =
      scope.k === 'fun'
        ? view.functionOf(scope)?.parameters.some((entry) => entry.name === name)
        : (scope.params ?? []).some((entry) => entry.name === name) ||
          (scope.k === 'lambda' && scope.params === undefined && name === 'it');
    if (
      declared ||
      (view.file.locals ?? []).some((local) => local.scope === scope.id && local.name === name)
    ) {
      return true;
    }
  }
  return false;
}

function elementOf(type, component) {
  const name = typeName(type).split('.').at(-1);
  const [first, second] = typeArguments(type);
  if (MAPS.has(name)) {
    return component === undefined ? undefined : [first, second][component - 1];
  }
  return component === undefined ? first : undefined;
}

function iterableStep(scope, component) {
  const iterable = scope.k === 'lambda' ? scope.qualifier : scope.range;
  if (iterable === undefined || CHUNKED.test(iterable)) {
    return { type: iterable !== undefined && component === undefined ? 'List' : undefined };
  }
  return {
    next: { id: scope.parent, text: iterable },
    then: (type) => elementOf(type, component),
  };
}

function parameterStep(scope, name) {
  const parameter = (scope.params ?? []).find((entry) => entry.name === name);
  const implicit = scope.k === 'lambda' && scope.params === undefined && name === 'it';
  if (parameter === undefined && !implicit) {
    return undefined;
  }
  if (parameter?.type !== undefined) {
    return { type: parameter.type };
  }
  if (scope.k === 'lambda' && IT_HOSTS.has(scope.host)) {
    return { next: { id: scope.parent, text: scope.qualifier } };
  }
  return iterableStep(scope, parameter?.component);
}

function localStep(view, scope, name) {
  const local = (view.file.locals ?? []).findLast(
    (entry) => entry.scope === scope.id && entry.name === name,
  );
  if (local === undefined) {
    return undefined;
  }
  if (local.type !== undefined || local.initializer !== undefined) {
    return { type: local.type ?? local.initializer };
  }
  return local.alias === undefined
    ? { type: undefined }
    : { next: { id: scope.id, text: local.alias } };
}

function classMemberType(view, scope, name) {
  const member =
    view.classes
      .get(scope.qualified)
      ?.primaryParameters.find((entry) => entry.name === name && entry.property) ??
    view.memberPropertiesOf(scope.qualified).find((entry) => entry.name === name);
  return member?.type ?? member?.initializer;
}

function scopeStep(view, scope, name) {
  if (scope.k === 'class') {
    const type = classMemberType(view, scope, name);
    return type === undefined ? undefined : { type };
  }
  if (scope.k === 'fun') {
    const type = view.functionOf(scope)?.parameters.find((entry) => entry.name === name)?.type;
    return type === undefined ? localStep(view, scope, name) : { type };
  }
  return parameterStep(scope, name) ?? localStep(view, scope, name);
}

function nameStep(view, id, name) {
  return (
    view
      .chain(id)
      .map((scope) => scopeStep(view, scope, name))
      .find((step) => step !== undefined) ?? { type: undefined }
  );
}

function memberOf(view, ownerType, member) {
  if (MAPS.has(typeName(ownerType).split('.').at(-1)) && MAP_VIEWS.has(member)) {
    return 'Collection';
  }
  if (member === 'environment' && view.is(ownerType, BEAN_FACTORIES)) {
    return 'org.springframework.core.env.Environment';
  }
  return view.memberTypeOf(ownerType, member);
}

function receiverStep(receiver) {
  if (receiver === undefined || receiver.type !== undefined) {
    return { type: receiver?.type };
  }
  return { next: { id: receiver.scope, text: receiver.text } };
}

function step(view, { id, text: raw }) {
  const text = (raw ?? '').replace(THIS, '');
  if (text === '' || text === 'this') {
    return receiverStep(implicitReceiver(view, id));
  }
  if (IDENTIFIER.test(text)) {
    return nameStep(view, id, text);
  }
  if (!DOTTED.test(text)) {
    return { type: undefined };
  }
  const split = text.lastIndexOf('.');
  return {
    next: { id, text: text.slice(0, split) },
    then: (ownerType) => memberOf(view, ownerType, text.slice(split + 1)),
  };
}

function settle(transforms, type) {
  return transforms.reduce(
    (current, transform) => (current === undefined ? undefined : transform(current)),
    type,
  );
}

export function typeOf(view, id, text) {
  const requests = [{ id, text, then: [] }];
  for (const request of requests) {
    const result = step(view, request);
    if (result.next === undefined) {
      return settle(request.then, result.type);
    }
    const then = result.then === undefined ? request.then : [result.then, ...request.then];
    requests.push(...(requests.length > DEPTH ? [] : [{ ...result.next, then }]));
  }
  return undefined;
}
