import { objectChildren } from '../../../../../../../shared/traversal.mjs';
const DISPOSE = 'dispose';
const CLOSE_NAMES = new Set([
  'close',
  DISPOSE,
  'destroy',
  'shutdown',
  'stop',
  'teardown',
  'disconnect',
  'end',
  'onModuleDestroy',
  'onApplicationShutdown',
  'beforeApplicationShutdown',
]);
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);
const SYMBOL_DISPOSERS = { dispose: DISPOSE, asyncDispose: DISPOSE };
const WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'ChainExpression',
]);

export function isFunctionNode(node) {
  return FUNCTION_TYPES.has(node.type);
}

export function unwrapExpression(node) {
  return chainEnd(node, (current) => (WRAPPERS.has(current.type) ? current.expression : undefined));
}

export function chainEnd(start, next) {
  const chain = [start];
  for (const current of chain) {
    const following = next(current);
    if (following !== undefined) {
      chain.push(following);
    }
  }
  return chain.at(-1);
}

function keyName(key, computed) {
  if (key.type === 'Identifier' && !computed) {
    return key.name;
  }
  if (key.type === 'Literal' && typeof key.value === 'string') {
    return key.value;
  }
  if (key.type === 'MemberExpression' && key.object.name === 'Symbol') {
    return SYMBOL_DISPOSERS[key.property.name];
  }
  return undefined;
}

export function functionName(fn) {
  if (fn.id) {
    return fn.id.name;
  }
  const { parent } = fn;
  if (['MethodDefinition', 'Property', 'PropertyDefinition'].includes(parent.type)) {
    return parent.value === fn ? keyName(parent.key, parent.computed) : undefined;
  }
  if (parent.type === 'VariableDeclarator' && parent.init === fn) {
    return parent.id.name;
  }
  if (parent.type === 'AssignmentExpression' && parent.right === fn) {
    return parent.left.name ?? parent.left.property?.name;
  }
  return undefined;
}

export function isCloseName(name) {
  return CLOSE_NAMES.has(name);
}

export function astChildren(node) {
  return objectChildren(node).filter((child) => typeof child.type === 'string');
}
