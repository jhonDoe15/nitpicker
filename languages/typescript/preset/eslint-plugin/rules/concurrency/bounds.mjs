import { ancestorsOf, chainOf } from '../analysis/ancestry.mjs';
import { findVariable } from '../analysis/constant-resolution.mjs';
import { memberName } from '../security/security-values.mjs';
import { createOrigins, descendants, skipped } from './io-origin.mjs';

const INFINITE = new Set(['Infinity']);
const LIMITER_NAME = /(?:limit|limiter|queue|sema|semaphore|throttle|throttler|mutex)$/iu;
const PROJECT_MODULE = /^[./]/u;

function hasProperty(object, name) {
  const target = skipped(object);
  const found =
    target?.type === 'ObjectExpression'
      ? target.properties.find((p) => p.type === 'Property' && p.key.name === name)
      : undefined;
  return found !== undefined && !INFINITE.has(found.value.name);
}

function hasLimitArgument(creation) {
  const first = creation?.arguments[0];
  return first !== undefined && !INFINITE.has(first.name);
}

function limiter(makers, valid, types = []) {
  return {
    kind: 'limiter',
    methods: '*',
    makers: new Set(makers),
    types: new Set(types),
    functions: new Set(),
    derivers: new Set(),
    valid,
  };
}

const LIMITERS = new Map([
  ['p-limit', limiter(['default'], hasLimitArgument, ['LimitFunction'])],
  [
    'p-queue',
    limiter(['default'], (creation) => hasProperty(creation?.arguments[0], 'concurrency')),
  ],
  [
    'bottleneck',
    limiter(['default'], (creation) => hasProperty(creation?.arguments[0], 'maxConcurrent')),
  ],
  ['p-throttle', limiter(['default'], (creation) => hasProperty(creation?.arguments[0], 'limit'))],
  ['async-sema', limiter(['Sema', 'RateLimit'], hasLimitArgument)],
  ['async-mutex', limiter(['Semaphore', 'Mutex'], () => true)],
  ['p-map', limiter([], () => false)],
  ['limiter', limiter(['RateLimiter'], (creation) => creation?.arguments[0] !== undefined)],
]);

function limiterSpec(source) {
  return LIMITERS.get(source);
}

function isWithin(node, root) {
  return chainOf(node, (current) => current.parent).includes(root);
}

function isUnboundedPMap(moduleRef, call) {
  const callee = skipped(call.callee);
  const ref = callee.type === 'Identifier' ? moduleRef(callee, callee.name) : undefined;
  const options = call.arguments[2] === undefined ? undefined : skipped(call.arguments[2]);
  const open =
    options === undefined ||
    (options.type === 'ObjectExpression' &&
      options.properties.every((property) => property.type === 'Property') &&
      !hasProperty(options, 'concurrency'));
  return ref?.source === 'p-map' && ref.imported === 'default' && open;
}

function holderOf(callee) {
  const target = skipped(callee);
  if (target.type !== 'MemberExpression') {
    return target;
  }
  const object = skipped(target.object);
  return object.type === 'ThisExpression' ? target : object;
}

function isThisMember(node) {
  return node.type === 'MemberExpression' && skipped(node.object).type === 'ThisExpression';
}

function classBodyOf(node) {
  return ancestorsOf(node).find((ancestor) => ancestor.type === 'ClassBody');
}

function receivedField(member, isParameter) {
  const key = memberName(member);
  return [...descendants(classBodyOf(member))].some(
    (node) =>
      (node.type === 'TSParameterProperty' && node.parameter.name === key) ||
      (node.type === 'AssignmentExpression' &&
        isThisMember(node.left) &&
        memberName(node.left) === key &&
        node.right.type === 'Identifier' &&
        isParameter(node.right)),
  );
}

function isParameter(context, identifier) {
  const variable = findVariable(context, identifier, identifier.name);
  return variable?.defs.some((definition) => definition.type === 'Parameter') === true;
}

function isImportedLimiter(context, identifier) {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  const source = definition?.type === 'ImportBinding' ? definition.parent.source.value : '';
  return PROJECT_MODULE.test(source) && LIMITER_NAME.test(identifier.name);
}

function received(context, holder) {
  if (holder.type === 'Identifier') {
    return isParameter(context, holder) || isImportedLimiter(context, holder);
  }
  return (
    isThisMember(holder) && receivedField(holder, (identifier) => isParameter(context, identifier))
  );
}

function limiterAt({ context, originOf }, callee, root) {
  const holder = holderOf(callee);
  if (received(context, holder)) {
    return true;
  }
  const found = originOf(holder);
  if (found?.instance !== true) {
    return false;
  }
  return (
    found.creation === undefined ||
    (!isWithin(found.creation, root) && found.spec.valid(found.creation))
  );
}

function wrapsInFunction(scope, call, fn) {
  const path = ancestorsOf(call);
  const inside = path.includes(fn) ? path.slice(0, path.indexOf(fn)) : path;
  const start = inside.findIndex((node) => /Function/u.test(node.type));
  return (
    start >= 0 &&
    inside
      .slice(start)
      .some((node) => node.type === 'CallExpression' && limiterAt(scope, node.callee, fn))
  );
}

function acquiresIn(scope, fn) {
  return [...descendants(fn.body)].some(
    (node) =>
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      ['acquire', 'removeTokens', 'runExclusive'].includes(memberName(node.callee)) &&
      limiterAt(scope, node.callee, fn),
  );
}

export function createBounds(context) {
  const { originOf, moduleRef } = createOrigins(context, limiterSpec);
  const scope = { context, originOf };
  return {
    wrapsInFunction: (call, fn) => wrapsInFunction(scope, call, fn),
    acquiresIn: (fn) => acquiresIn(scope, fn),
    limiterAt: (callee, root) => limiterAt(scope, callee, root),
    isUnboundedPMap: (call) => isUnboundedPMap(moduleRef, call),
  };
}
