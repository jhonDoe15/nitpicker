import {
  calledMember,
  memberName,
  numberValue,
  outerOf,
  unwrapped,
} from '../costly-forms/repeated-runs.mjs';

const TESTS = new Map([
  ['IfStatement', 'test'],
  ['WhileStatement', 'test'],
  ['DoWhileStatement', 'test'],
  ['ForStatement', 'test'],
  ['ConditionalExpression', 'test'],
]);
const EQUALITY = new Set(['===', '!==', '==', '!=']);
const NON_EMPTY = new Set(['>0', '!==0', '!=0', '>=1']);
const EMPTY = new Set(['===0', '==0', '<1']);
const MIRRORED = new Map([
  ['<', '>'],
  ['>', '<'],
  ['<=', '>='],
  ['>=', '<='],
]);

function methodCall(node, name) {
  const call = unwrapped(node);
  const member = call.type === 'CallExpression' ? calledMember(call) : undefined;
  return member !== undefined && !member.computed && memberName(member) === name
    ? { call, receiver: unwrapped(member.object) }
    : undefined;
}

function isNothing(node) {
  const value = unwrapped(node);
  return (
    (value.type === 'Identifier' && value.name === 'undefined') ||
    (value.type === 'Literal' && value.value === null && value.raw === 'null')
  );
}

export function filterFirst(member) {
  const filtered = methodCall(member.object, 'filter');
  if (filtered === undefined) {
    return undefined;
  }
  const takesFirst = member.computed
    ? numberValue(member.property) === 0
    : memberName(member) === 'at' && isFirstCall(member);
  const outer = outerOf(member);
  const written =
    (outer.parent.type === 'AssignmentExpression' && outer.parent.left === outer) ||
    outer.parent.type === 'UpdateExpression';
  const [test] = filtered.call.arguments;
  return takesFirst && !written && isCallback(test)
    ? { node: member, messageId: 'filterFirst' }
    : undefined;
}

function isFirstCall(member) {
  const call = outerOf(member).parent;
  return (
    call.type === 'CallExpression' &&
    call.arguments.length === 1 &&
    numberValue(call.arguments[0]) === 0
  );
}

function isBooleanUse(outer) {
  const { parent } = outer;
  if (TESTS.get(parent.type) !== undefined) {
    return parent[TESTS.get(parent.type)] === outer;
  }
  if (parent.type === 'UnaryExpression') {
    return parent.operator === '!';
  }
  if (parent.type === 'BinaryExpression' && EQUALITY.has(parent.operator)) {
    return isNothing(parent.left === outer ? parent.right : parent.left);
  }
  return (
    parent.type === 'CallExpression' &&
    parent.arguments.length === 1 &&
    parent.callee.type === 'Identifier' &&
    parent.callee.name === 'Boolean'
  );
}

function isCallback(node) {
  const value = node === undefined ? undefined : unwrapped(node);
  return (
    value?.type === 'ArrowFunctionExpression' ||
    value?.type === 'FunctionExpression' ||
    (value?.type === 'Identifier' && value.name !== 'undefined')
  );
}

function isInlineCallback(node) {
  const value = unwrapped(node);
  return value.type === 'ArrowFunctionExpression' || value.type === 'FunctionExpression';
}

export function findAsBoolean(call) {
  const found = methodCall(call, 'find');
  const [test] = found?.call.arguments ?? [];
  const takesCallback = found?.call.arguments.length === 1 && isInlineCallback(test);
  return found !== undefined && takesCallback && isBooleanUse(outerOf(call))
    ? { node: call, messageId: 'findAsBoolean' }
    : undefined;
}

export function mapFlat(call) {
  const flat = methodCall(call, 'flat');
  const depth = flat?.call.arguments ?? [];
  const once = depth.length === 0 || (depth.length === 1 && numberValue(depth[0]) === 1);
  return flat !== undefined && once && methodCall(flat.receiver, 'map') !== undefined
    ? { node: call, messageId: 'mapFlat' }
    : undefined;
}

function lengthTest(sourceCode, node) {
  const test = unwrapped(node);
  if (test.type !== 'BinaryExpression') {
    return undefined;
  }
  const lengthOnLeft = isLengthRead(test.left);
  const [length, bound, operator] = lengthOnLeft
    ? [test.left, test.right, test.operator]
    : [test.right, test.left, MIRRORED.get(test.operator) ?? test.operator];
  const count = numberValue(bound);
  if (!isLengthRead(length) || count === undefined) {
    return undefined;
  }
  return {
    receiver: sourceCode.getText(unwrapped(unwrapped(length).object)),
    test: `${operator}${String(count)}`,
  };
}

const CALLS = new Set([
  'CallExpression',
  'NewExpression',
  'TaggedTemplateExpression',
  'AwaitExpression',
]);

function hasCall(node) {
  const pending = [node];
  for (const current of pending) {
    if (CALLS.has(current.type)) {
      return true;
    }
    const parts = [current.object, current.property, current.expression].filter(Boolean);
    pending.push(...parts.filter((part) => typeof part.type === 'string'));
  }
  return false;
}

function isLengthRead(node) {
  const value = unwrapped(node);
  return (
    value.type === 'MemberExpression' &&
    !value.computed &&
    !value.optional &&
    memberName(value) === 'length'
  );
}

export function lengthCheck(sourceCode, logical) {
  if (logical.operator === '??') {
    return undefined;
  }
  const length = lengthTest(sourceCode, logical.left);
  const method = logical.operator === '&&' ? 'some' : 'every';
  const tests = logical.operator === '&&' ? NON_EMPTY : EMPTY;
  const called = methodCall(logical.right, method);
  const same =
    length !== undefined &&
    called !== undefined &&
    tests.has(length.test) &&
    !hasCall(called.receiver) &&
    sourceCode.getText(called.receiver) === length.receiver;
  return same
    ? {
        node: logical.left,
        messageId: 'lengthCheck',
        data: { method, answer: String(method === 'every') },
      }
    : undefined;
}
