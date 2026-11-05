import { ancestorsOf, chainOf, variableNamed } from '../analysis/ancestry.mjs';
import { isFunctionNode, resolveConstant, stringValue } from '../analysis/constant-resolution.mjs';
import { importedCalleeName } from '../analysis/subprocess-calls.mjs';
import { memberName } from '../analysis/test-code-analysis.mjs';

const END_EVENTS = new Set(['exit', 'close']);
const LISTENERS = new Set(['on', 'once', 'addListener', 'prependListener', 'prependOnceListener']);
const ESCAPING_PARENTS = new Set([
  'ReturnStatement',
  'ArrowFunctionExpression',
  'Property',
  'ArrayExpression',
  'AssignmentExpression',
  'VariableDeclarator',
  'SpreadElement',
  'ExportSpecifier',
]);

function isEndEvent(context, node) {
  return END_EVENTS.has(stringValue(resolveConstant(context, node)));
}

function insidePromiseExecutor(node) {
  const executor = ancestorsOf(node).find(isFunctionNode);
  const parent = executor?.parent;
  return (
    parent?.type === 'NewExpression' &&
    parent.callee.type === 'Identifier' &&
    parent.callee.name === 'Promise' &&
    parent.arguments[0] === executor
  );
}

function listenerCall(emitter) {
  const member = emitter.parent;
  const call = member?.parent;
  return member?.type === 'MemberExpression' &&
    member.object === emitter &&
    call?.type === 'CallExpression' &&
    call.callee === member &&
    LISTENERS.has(memberName(member))
    ? call
    : undefined;
}

function listensForEnd(context, emitter) {
  const listeners = chainOf(listenerCall(emitter), listenerCall);
  return listeners.some(
    (call) => isEndEvent(context, call.arguments[0]) && insidePromiseExecutor(call),
  );
}

function isOnceCall(context, use, events) {
  const call = use.parent;
  return (
    call?.type === 'CallExpression' &&
    call.arguments[0] === use &&
    importedCalleeName(call.callee, events) === 'once' &&
    isEndEvent(context, call.arguments[1])
  );
}

function escapes(context, use, events) {
  const parent = use.parent;
  if (parent?.type === 'MemberExpression' && parent.object === use) {
    return memberName(parent) === 'kill';
  }
  if (parent?.type === 'CallExpression' || parent?.type === 'NewExpression') {
    return parent.callee !== use && !isOnceCall(context, use, events);
  }
  return ESCAPING_PARENTS.has(parent?.type);
}

function heldChild(context, call) {
  const declarator = call.parent;
  if (
    declarator?.type !== 'VariableDeclarator' ||
    declarator.init !== call ||
    declarator.id.type !== 'Identifier'
  ) {
    return undefined;
  }
  const variable = variableNamed(context.sourceCode, declarator.id);
  return variable?.references.filter((reference) => !reference.init).map((ref) => ref.identifier);
}

export function waitsForChildEnd(context, call, events) {
  const uses = call.parent?.type === 'VariableDeclarator' ? heldChild(context, call) : [call];
  if (uses === undefined || uses.some((use) => escapes(context, use, events))) {
    return false;
  }
  return uses.some((use) => listensForEnd(context, use) || isOnceCall(context, use, events));
}

function isThenTarget(node) {
  return (
    node.parent?.type === 'MemberExpression' &&
    node.parent.object === node &&
    memberName(node.parent) === 'then'
  );
}

function isAwaitedValue(node) {
  return node.parent?.type === 'AwaitExpression' || isThenTarget(node);
}

export function isAwaited(context, call) {
  if (isAwaitedValue(call)) {
    return true;
  }
  const uses = call.parent?.type === 'VariableDeclarator' ? heldChild(context, call) : [];
  return (uses ?? []).some(isAwaitedValue);
}
