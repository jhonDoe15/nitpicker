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
const KEEPS_SIZE = new Set([
  'filter',
  'map',
  'sort',
  'toSorted',
  'reverse',
  'toReversed',
  'flat',
  'fill',
  'keys',
]);
const OBJECT_VIEWS = new Set(['keys', 'values', 'entries']);
const INFINITE = new Set(['Infinity']);
const SIZES = new Set(['length', 'size']);
const LIMITER_NAME = /(?:limit|limiter|queue|sema|semaphore|throttle|throttler|mutex)$/iu;
const PROJECT_MODULE = /^[./]/u;
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

export function createBounds(context) {
  const { originOf, moduleRef } = createOrigins(context, limiterSpec);

  function isParameter(identifier) {
    const variable = findVariable(context, identifier, identifier.name);
    return variable?.defs.some((definition) => definition.type === 'Parameter') === true;
  }

  function isImportedLimiter(identifier) {
    const definition = findVariable(context, identifier, identifier.name)?.defs[0];
    const source = definition?.type === 'ImportBinding' ? definition.parent.source.value : '';
    return PROJECT_MODULE.test(source) && LIMITER_NAME.test(identifier.name);
  }

  function received(holder) {
    if (holder.type === 'Identifier') {
      return isParameter(holder) || isImportedLimiter(holder);
    }
    return isThisMember(holder) && receivedField(holder, isParameter);
  }

  function limiterAt(callee, root) {
    const holder = holderOf(callee);
    if (received(holder)) {
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

  return {
    wrapsInFunction,
    acquiresIn,
    limiterAt,
    isUnboundedPMap: (call) => isUnboundedPMap(moduleRef, call),
  };
}

function numericParts(target) {
  if (target.type === 'Literal') {
    return typeof target.value === 'number' ? [] : undefined;
  }
  if (target.type === 'UnaryExpression') {
    return [target.argument];
  }
  return target.type === 'BinaryExpression' ? [target.left, target.right] : undefined;
}

function numeric(context, node) {
  const pending = [{ node, depth: 0 }];
  for (const entry of pending) {
    const target = resolveConstant(context, skipped(entry.node));
    const parts =
      target === undefined || entry.depth > MAX_DEPTH ? undefined : numericParts(target);
    if (parts === undefined) {
      return false;
    }
    pending.push(...parts.map((part) => ({ node: part, depth: entry.depth + 1 })));
  }
  return true;
}

function explicitSize(node) {
  return ![...descendants(node)].some(
    (child) => child.type === 'MemberExpression' && SIZES.has(memberName(child)),
  );
}

function resolvedValue(context, node) {
  let current = skipped(node);
  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    const next = skipped(resolveConstant(context, current));
    if (next === current || next === undefined) {
      return next;
    }
    current = next;
  }
  return current;
}

function isEnum(context, identifier) {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  return definition?.type === 'TSEnumName';
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
  return length !== undefined && explicitSize(resolvedValue(context, length.value));
}

function countOf(context, node) {
  return node !== undefined && explicitSize(resolvedValue(context, node));
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

function fixedCall(context, call) {
  const name = call.callee.type === 'MemberExpression' ? memberName(call.callee) : call.callee.name;
  const owner = call.callee.type === 'MemberExpression' ? skipped(call.callee.object) : undefined;
  if (['slice', 'splice'].includes(name)) {
    return sizedWindow(context, call);
  }
  if (owner?.name === 'Object' && OBJECT_VIEWS.has(name)) {
    return { next: call.arguments[0] };
  }
  if (owner?.name === 'Array' && name === 'from') {
    return sizedByLength(context, call.arguments[0]);
  }
  if (name === 'Array' && call.arguments.length === 1) {
    return countOf(context, call.arguments[0]);
  }
  return KEEPS_SIZE.has(name) && owner !== undefined ? { next: owner } : false;
}

function fixedStep(context, target, depth) {
  if (target.type === 'ArrayExpression') {
    return (
      target.elements.length > 0 &&
      target.elements.every(
        (element) =>
          element !== null &&
          (element.type !== 'SpreadElement' ||
            isFixedCollection(context, element.argument, depth + 1)),
      )
    );
  }
  if (target.type === 'ObjectExpression') {
    return (
      target.properties.length > 0 &&
      target.properties.every((property) => property.type === 'Property')
    );
  }
  if (target.type === 'CallExpression') {
    return fixedCall(context, target);
  }
  if (target.type === 'NewExpression') {
    return (
      target.callee.name === 'Array' &&
      target.arguments.length === 1 &&
      countOf(context, target.arguments[0])
    );
  }
  return (
    target.type === 'Identifier' &&
    (isEnum(context, target) || isChunkVariable(context, target))
  );
}

export function isFixedCollection(context, node, start = 0) {
  const pending = [{ node, depth: start }];
  for (const entry of pending) {
    const target = resolvedValue(context, entry.node);
    if (target === undefined || entry.depth > MAX_DEPTH) {
      return false;
    }
    const step = fixedStep(context, target, entry.depth);
    if (typeof step === 'boolean') {
      return step;
    }
    pending.push({ node: step.next, depth: entry.depth + 1 });
  }
  return false;
}
