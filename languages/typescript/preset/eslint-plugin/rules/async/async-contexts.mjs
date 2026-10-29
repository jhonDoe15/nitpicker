import { ancestorsOf } from '../analysis/ancestry.mjs';
import { findVariable, isFunctionNode, resolveFunction } from '../analysis/constant-resolution.mjs';
import { memberName } from '../security/security-values.mjs';
import { NEST_DECORATORS, ROUTE_METHODS, SYNCHRONOUS_CALLBACK_METHODS } from './sync-node-apis.mjs';

const EXPORT_WRAPPERS = new Set(['ExportNamedDeclaration', 'ExportDefaultDeclaration']);
const ROUTE_METHOD_NAMES = new Set(ROUTE_METHODS);
const NEST_DECORATOR_NAMES = new Set(NEST_DECORATORS);
const CALLBACK_METHOD_NAMES = new Set(SYNCHRONOUS_CALLBACK_METHODS);

function nearestFunction(node) {
  return ancestorsOf(node).find(isFunctionNode);
}

function isCallbackOf(fn, methods) {
  const call = fn.parent;
  return (
    call?.type === 'CallExpression' &&
    call.arguments.includes(fn) &&
    call.callee.type === 'MemberExpression' &&
    methods.has(memberName(call.callee))
  );
}

function decoratorName(decorator) {
  const expression = decorator.expression;
  const callee = expression.type === 'CallExpression' ? expression.callee : expression;
  return callee.type === 'Identifier' ? callee.name : undefined;
}

function isNestHandler(fn, nestBindings) {
  const method = fn.parent;
  return (
    method?.type === 'MethodDefinition' &&
    method.value === fn &&
    (method.decorators ?? []).some((decorator) => {
      const imported = nestBindings.named.get(decoratorName(decorator));
      return imported !== undefined && NEST_DECORATOR_NAMES.has(imported);
    })
  );
}

function handlersIn(context, argumentsList) {
  return argumentsList
    .map((argument) => (isFunctionNode(argument) ? argument : resolveFunction(context, argument)))
    .filter((handler) => handler !== undefined);
}

export function routeHandlers(context, calls, frameworks) {
  const handlers = new Set();
  if (!frameworks) {
    return handlers;
  }
  for (const call of calls) {
    const route =
      call.callee.type === 'MemberExpression' && ROUTE_METHOD_NAMES.has(memberName(call.callee));
    for (const handler of route ? handlersIn(context, call.arguments) : []) {
      handlers.add(handler);
    }
  }
  return handlers;
}

function boundVariable(context, fn) {
  if (fn.type === 'FunctionDeclaration' && fn.id !== null) {
    return findVariable(context, fn.id, fn.id.name);
  }
  const declarator = fn.parent;
  const isConst = declarator?.type === 'VariableDeclarator' && declarator.parent.kind === 'const';
  return isConst && declarator.id.type === 'Identifier'
    ? findVariable(context, declarator.id, declarator.id.name)
    : undefined;
}

function isExported(fn) {
  const declaration = fn.type === 'FunctionDeclaration' ? fn : fn.parent?.parent?.parent;
  return EXPORT_WRAPPERS.has(declaration?.parent?.type);
}

function isInvocation(reference) {
  const call = reference.identifier.parent;
  return call?.type === 'CallExpression' && call.callee === reference.identifier;
}

function callSites(context, fn) {
  const variable = boundVariable(context, fn);
  const references = (variable?.references ?? []).filter((reference) => !reference.init);
  const invokedOnly =
    variable !== undefined &&
    !isExported(fn) &&
    references.length > 0 &&
    references.every(isInvocation);
  return invokedOnly
    ? references.map((reference) => nearestFunction(reference.identifier))
    : undefined;
}

export function isStartupFunction(context, fn) {
  const seen = new Set();
  const pending = [fn];
  for (const current of pending) {
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    const owners = callSites(context, current);
    if (owners === undefined) {
      return false;
    }
    pending.push(...owners.filter((owner) => owner !== undefined));
  }
  return true;
}

export function enclosingContext(call, { handlers, nestBindings }) {
  for (const fn of ancestorsOf(call).filter(isFunctionNode)) {
    if (fn.async) {
      return { kind: 'async', fn };
    }
    if (handlers.has(fn) || isNestHandler(fn, nestBindings)) {
      return { kind: 'handler', fn };
    }
    if (!isCallbackOf(fn, CALLBACK_METHOD_NAMES)) {
      return undefined;
    }
  }
  return undefined;
}
