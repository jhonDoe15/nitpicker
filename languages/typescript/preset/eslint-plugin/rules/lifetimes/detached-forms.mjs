import { variableNamed } from '../analysis/ancestry.mjs';

const FUNCTION_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression']);
const TIMERS = new Set(['setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask']);
const TIMER_OWNERS = new Set(['globalThis', 'window', 'self', 'global']);
const FIRST_DEFERRED_ARGUMENT = 2;

function isTimer(callee) {
  if (callee.type === 'Identifier') {
    return TIMERS.has(callee.name);
  }
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    ((TIMER_OWNERS.has(callee.object.name) && TIMERS.has(callee.property.name)) ||
      (callee.object.name === 'process' && callee.property.name === 'nextTick'))
  );
}

function isDeferredArgument(call, child) {
  const index = call.arguments.indexOf(child);
  return index >= 0 && (FUNCTION_TYPES.has(child.type) || index >= FIRST_DEFERRED_ARGUMENT);
}

function isAsyncFunction(node) {
  return node !== undefined && node !== null && FUNCTION_TYPES.has(node.type) && node.async;
}

function isAsyncCall(sourceCode, call) {
  if (isAsyncFunction(call.callee)) {
    return true;
  }
  if (call.callee.type !== 'Identifier') {
    return false;
  }
  const definition = variableNamed(sourceCode, call.callee)?.defs.at(0);
  if (definition?.type === 'FunctionName') {
    return definition.node.async;
  }
  return definition?.type === 'Variable' && isAsyncFunction(definition.node.init);
}

function isUnread(sourceCode, declarator) {
  const [variable] = sourceCode.getDeclaredVariables(declarator);
  return variable !== undefined && variable.references.every(({ init }) => init);
}

function stored(sourceCode, parent) {
  if (parent.type === 'ReturnStatement') {
    return 'returned';
  }
  return parent.type === 'VariableDeclarator' &&
    parent.id.type === 'Identifier' &&
    isUnread(sourceCode, parent)
    ? 'unawaited'
    : undefined;
}

const FUNCTION_NODES = new Set(['FunctionDeclaration', ...FUNCTION_TYPES]);

function ownerFunction(node) {
  for (let current = node.parent; current !== null; current = current.parent) {
    if (FUNCTION_NODES.has(current.type)) {
      return current;
    }
  }
  return null;
}

const AWAITED = { messageId: undefined };

function formAt(sourceCode, node, step) {
  if (node.type === 'AwaitExpression' && step.direct) {
    return AWAITED;
  }
  if (node.type === 'UnaryExpression' && node.operator === 'void') {
    return { messageId: 'detached', node };
  }
  if (node.type !== 'CallExpression') {
    return undefined;
  }
  const messageId = callForm(sourceCode, node, step);
  return messageId === undefined ? undefined : { messageId, node };
}

export function detachedForm(sourceCode, identifier, region) {
  const regionFunction = ownerFunction(region);
  let child = identifier;
  for (let node = identifier.parent; node !== null && node !== region; node = node.parent) {
    const form = formAt(sourceCode, node, {
      child,
      direct: ownerFunction(node) === regionFunction,
    });
    if (form !== undefined) {
      return form === AWAITED ? undefined : form;
    }
    child = node;
  }
  return undefined;
}

function callForm(sourceCode, call, { child, direct }) {
  if (isTimer(call.callee) && isDeferredArgument(call, child)) {
    return 'deferred';
  }
  return direct && isAsyncCall(sourceCode, call) ? stored(sourceCode, call.parent) : undefined;
}
