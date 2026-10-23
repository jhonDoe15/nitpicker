import { ancestorsOf, chainOf } from '../analysis/ancestry.mjs';
import { findVariable, resolveConstant } from '../analysis/constant-resolution.mjs';
import { memberName } from '../security/security-values.mjs';
import { createOrigins, descendants, skipped } from './io-origin.mjs';

const CHUNKERS = new Set([
  'chunk',
  'chunked',
  'chunks',
  'splitEvery',
  'cluster',
  'batch',
  'batches',
  'inGroupsOf',
]);
const KEEPS_SIZE = new Set(['filter', 'map', 'sort', 'toSorted', 'reverse', 'toReversed', 'flat']);
const OBJECT_VIEWS = new Set(['keys', 'values', 'entries']);
const INFINITE = new Set(['Infinity']);
const MAX_DEPTH = 6;

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

function limiter(makers, valid) {
  return {
    kind: 'limiter',
    methods: '*',
    makers: new Set(makers),
    types: new Set(),
    functions: new Set(),
    derivers: new Set(),
    valid,
  };
}

const LIMITERS = new Map([
  ['p-limit', limiter(['default'], hasLimitArgument)],
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

export function createBounds(context) {
  const { originOf, moduleRef } = createOrigins(context, limiterSpec);

  function isParameter(identifier) {
    const variable = findVariable(context, identifier, identifier.name);
    return variable?.defs.some((definition) => definition.type === 'Parameter') === true;
  }

  function limiterAt(callee, root) {
    const target = skipped(callee);
    const holder = target.type === 'MemberExpression' ? skipped(target.object) : target;
    if (holder.type === 'Identifier' && isParameter(holder)) {
      return true;
    }
    const found = originOf(holder);
    const outside = found?.creation === undefined || !isWithin(found.creation, root);
    return found?.instance === true && outside && found.spec.valid(found.creation);
  }

  function wrapsInFunction(call, fn) {
    const path = ancestorsOf(call);
    const inside = path.includes(fn) ? path.slice(0, path.indexOf(fn)) : path;
    const start = inside.findIndex((node) => /Function/u.test(node.type));
    return (
      start >= 0 &&
      inside
        .slice(start)
        .some((node) => node.type === 'CallExpression' && limiterAt(node.callee, fn))
    );
  }

  function acquiresIn(fn) {
    return [...descendants(fn.body)].some(
      (node) =>
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        ['acquire', 'removeTokens', 'runExclusive'].includes(memberName(node.callee)) &&
        limiterAt(node.callee, fn),
    );
  }

  function isUnboundedPMap(call) {
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

  return { wrapsInFunction, acquiresIn, limiterAt, isUnboundedPMap };
}

function numeric(context, node, depth = 0) {
  const target = resolveConstant(context, skipped(node));
  if (depth > MAX_DEPTH || target === undefined) {
    return false;
  }
  if (target.type === 'Literal') {
    return typeof target.value === 'number';
  }
  if (target.type === 'UnaryExpression') {
    return numeric(context, target.argument, depth + 1);
  }
  return (
    target.type === 'BinaryExpression' &&
    numeric(context, target.left, depth + 1) &&
    numeric(context, target.right, depth + 1)
  );
}

function explicitSize(node) {
  return ![...descendants(node)].some(
    (child) => child.type === 'MemberExpression' && memberName(child) === 'length',
  );
}

function sizedWindow(context, call) {
  const [first, second] = call.arguments;
  if (memberName(call.callee) === 'slice' && second === undefined) {
    return first !== undefined && numeric(context, first);
  }
  return second !== undefined && explicitSize(second);
}

function sizedByLength(context, node) {
  const object = skipped(node);
  const length =
    object?.type === 'ObjectExpression'
      ? object.properties.find((p) => p.key?.name === 'length')
      : undefined;
  return length !== undefined && numeric(context, length.value);
}

function isChunkCall(context, node) {
  const target = resolveConstant(context, skipped(node));
  const name = target?.callee?.name ?? (target?.callee ? memberName(target.callee) : undefined);
  const chunker = target?.type === 'CallExpression' && CHUNKERS.has(name);
  return chunker && target.arguments[1] !== undefined && explicitSize(target.arguments[1]);
}

function isChunkVariable(context, identifier) {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  const loop = definition?.type === 'Variable' ? definition.node.parent?.parent : undefined;
  return loop?.type === 'ForOfStatement' && isChunkCall(context, loop.right);
}

function fixedCall(context, call, depth) {
  const name = call.callee.type === 'MemberExpression' ? memberName(call.callee) : call.callee.name;
  const owner = call.callee.type === 'MemberExpression' ? skipped(call.callee.object) : undefined;
  if (['slice', 'splice'].includes(name)) {
    return sizedWindow(context, call);
  }
  if (owner?.name === 'Object' && OBJECT_VIEWS.has(name)) {
    return isFixedCollection(context, call.arguments[0], depth + 1);
  }
  if (owner?.name === 'Array' && name === 'from') {
    return sizedByLength(context, call.arguments[0]);
  }
  if (name === 'Array' && call.arguments.length === 1) {
    return numeric(context, call.arguments[0]);
  }
  return (
    KEEPS_SIZE.has(name) && owner !== undefined && isFixedCollection(context, owner, depth + 1)
  );
}

export function isFixedCollection(context, node, depth = 0) {
  const target = resolveConstant(context, skipped(node));
  if (target === undefined || depth > MAX_DEPTH) {
    return false;
  }
  if (target.type === 'ArrayExpression') {
    return (
      target.elements.length > 0 &&
      target.elements.every((element) => element !== null && element.type !== 'SpreadElement')
    );
  }
  if (target.type === 'ObjectExpression') {
    return (
      target.properties.length > 0 &&
      target.properties.every((property) => property.type === 'Property')
    );
  }
  if (target.type === 'CallExpression') {
    return fixedCall(context, target, depth);
  }
  if (target.type === 'NewExpression') {
    return (
      target.callee.name === 'Array' &&
      target.arguments.length === 1 &&
      numeric(context, target.arguments[0])
    );
  }
  return target.type === 'Identifier' && isChunkVariable(context, target);
}
