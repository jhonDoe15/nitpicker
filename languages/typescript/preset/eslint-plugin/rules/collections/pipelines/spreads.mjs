import { calledMember, memberName, unwrapped } from '../costly-forms/repeated-runs.mjs';

const ARRAY_RESULTS = new Set([
  'concat',
  'flat',
  'slice',
  'split',
  'toReversed',
  'toSorted',
  'toSpliced',
  'with',
]);
const STATIC_ARRAY_RESULTS = new Map([
  ['Array', new Set(['from', 'of'])],
  ['Object', new Set(['entries', 'keys', 'values'])],
]);
const ITERABLE_CONSTRUCTORS = new Set(['Map', 'Set', 'WeakMap', 'WeakSet']);
const PROMISE_METHODS = new Set(['all', 'allSettled', 'any', 'race']);
const FALLBACKS = new Set(['||', '??']);

function staticCall(node, owners) {
  const call = unwrapped(node);
  const member = call.type === 'CallExpression' ? calledMember(call) : undefined;
  const owner = member === undefined ? undefined : unwrapped(member.object);
  return owner?.type === 'Identifier' && owners.get(owner.name)?.has(memberName(member)) === true;
}

function isNewArray(node) {
  const value = unwrapped(node);
  if (value.type === 'ArrayExpression') {
    return true;
  }
  if (value.type === 'AwaitExpression') {
    return staticCall(value.argument, new Map([['Promise', PROMISE_METHODS]]));
  }
  const member = value.type === 'CallExpression' ? calledMember(value) : undefined;
  return (
    staticCall(value, STATIC_ARRAY_RESULTS) ||
    (member !== undefined && !member.computed && ARRAY_RESULTS.has(memberName(member)))
  );
}

function takesIterable(outer) {
  const { parent } = outer;
  if (parent.type === 'NewExpression') {
    const callee = unwrapped(parent.callee);
    return (
      parent.arguments[0] === outer &&
      callee.type === 'Identifier' &&
      ITERABLE_CONSTRUCTORS.has(callee.name)
    );
  }
  if (parent.type === 'CallExpression') {
    return (
      parent.arguments.length === 1 &&
      parent.arguments[0] === outer &&
      staticCall(
        parent,
        new Map([
          ['Array', new Set(['from'])],
          ['Promise', PROMISE_METHODS],
        ]),
      )
    );
  }
  return false;
}

export function uselessSpread(array) {
  const [only] = array.elements;
  if (array.elements.length !== 1 || only?.type !== 'SpreadElement') {
    return undefined;
  }
  if (isNewArray(only.argument)) {
    return {
      node: only,
      messageId: 'uselessSpread',
      data: { what: 'an array that is already new' },
    };
  }
  return takesIterable(array)
    ? {
        node: only,
        messageId: 'uselessSpread',
        data: { what: 'an iterable that the receiver already takes' },
      }
    : undefined;
}

export function fallbackSpread(spread) {
  const value = unwrapped(spread.argument);
  const fallback = value.type === 'LogicalExpression' ? unwrapped(value.right) : undefined;
  return FALLBACKS.has(value.operator) &&
    fallback?.type === 'ObjectExpression' &&
    fallback.properties.length === 0
    ? { node: spread, messageId: 'fallbackInSpread', data: { operator: value.operator } }
    : undefined;
}
