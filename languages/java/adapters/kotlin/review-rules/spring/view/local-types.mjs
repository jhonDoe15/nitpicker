import { callResult } from './call-types.mjs';
import { lastSelector, normalized, parseSelector, unwrapped } from './expressions.mjs';
import { componentOf, elementOf, memberOf } from './member-types.mjs';

const THIS = /^this\./u;
const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const RECEIVER_HOSTS = new Set(['apply', 'run', 'with']);
const IT_HOSTS = new Set(['let', 'also', 'takeIf', 'takeUnless']);
const INDEXED_HOSTS = new Set([
  'forEachIndexed',
  'mapIndexed',
  'mapIndexedNotNull',
  'onEachIndexed',
  'filterIndexed',
  'flatMapIndexed',
]);
const INITIALIZER_TYPES = new Map([['groupBy', 'Map<Any, List<Any>>']]);
const COMPONENT_TYPES = new Map([['partition', ['List<Any>', 'List<Any>']]]);
const DEPTH = 8;
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

function iterableStep(scope, component) {
  const iterable = scope.k === 'lambda' || scope.k === 'fun' ? scope.qualifier : scope.range;
  if (iterable === undefined) {
    return { type: undefined };
  }
  return {
    next: { id: scope.parent, text: iterable },
    then: (type) =>
      component === undefined ? elementOf(type) : componentOf(elementOf(type), component),
  };
}

function positionalComponent(scope, parameter) {
  const params = scope.params ?? [];
  const position = params.indexOf(parameter);
  if (parameter === undefined || parameter.component !== undefined || params.length !== 2) {
    return { component: parameter?.component };
  }
  return INDEXED_HOSTS.has(scope.host)
    ? { type: position === 0 ? 'Int' : undefined, component: undefined }
    : { component: position + 1 };
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
  const { type, component } = positionalComponent(scope, parameter);
  return type === undefined ? iterableStep(scope, component) : { type };
}

function localStep(view, scope, name) {
  const local = (view.file.locals ?? []).findLast(
    (entry) => entry.scope === scope.id && entry.name === name,
  );
  if (local === undefined) {
    return undefined;
  }
  if (local.component !== undefined) {
    return { type: local.type ?? COMPONENT_TYPES.get(local.initializer)?.[local.component - 1] };
  }
  if (local.type !== undefined) {
    return { type: local.type };
  }
  const initialized = initializerStep(view, scope, local);
  if (initialized !== undefined) {
    return initialized;
  }
  if (local.initializer !== undefined) {
    return { type: INITIALIZER_TYPES.get(local.initializer) ?? local.initializer };
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

function receiverStep(receiver) {
  if (receiver === undefined || receiver.type !== undefined) {
    return { type: receiver?.type };
  }
  return { next: { id: receiver.scope, text: receiver.text } };
}

function callStep(view, site, fallback) {
  function then(ownerType) {
    return callResult(view, site, ownerType) ?? fallback;
  }
  then.total = true;
  return site.head === undefined
    ? { type: then(undefined) }
    : { next: { id: site.id, text: site.head }, then };
}

function initializerStep(view, scope, local) {
  const invocation = view.file.invocations.find(
    (entry) =>
      entry.assignedTo === local.name &&
      entry.scope === scope.id &&
      entry.line >= local.line &&
      entry.after === undefined &&
      entry.reference !== true,
  );
  if (invocation === undefined) {
    return undefined;
  }
  const call = {
    name: invocation.name,
    typeArguments: invocation.line === local.line ? local.initializerTypeArguments : undefined,
    arguments: invocation.arguments,
  };
  const fallback =
    local.initializer === undefined
      ? undefined
      : (INITIALIZER_TYPES.get(local.initializer) ?? local.initializer);
  return callStep(view, { id: scope.id, head: invocation.receiver, call }, fallback);
}

function step(view, { id, text: raw }) {
  const text = normalized(raw).replace(THIS, '');
  if (text === '' || text === 'this') {
    return receiverStep(implicitReceiver(view, id));
  }
  if (IDENTIFIER.test(text)) {
    return nameStep(view, id, text);
  }
  const inner = unwrapped(text);
  if (inner !== undefined) {
    return { next: { id, text: inner } };
  }
  const parts = lastSelector(text);
  const selector = parseSelector(parts?.selector ?? text);
  if (selector === undefined || (parts === undefined && !selector.call)) {
    return { type: undefined };
  }
  if (selector.call) {
    return callStep(view, { id, head: parts?.head, call: selector });
  }
  return {
    next: { id, text: parts.head },
    then: (ownerType) => memberOf(view, ownerType, selector.name),
  };
}

function settle(transforms, type) {
  return transforms.reduce(
    (current, transform) =>
      current === undefined && transform.total !== true ? undefined : transform(current),
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
