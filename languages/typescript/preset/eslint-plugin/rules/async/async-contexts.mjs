import { ancestorsOf } from '../analysis/ancestry.mjs';
import { findVariable, isFunctionNode, resolveFunction } from '../analysis/constant-resolution.mjs';
import { memberName } from '../security/security-values.mjs';
import { NEST_DECORATORS, ROUTE_METHODS, SYNCHRONOUS_CALLBACK_METHODS } from './sync-node-apis.mjs';

const EXPORT_WRAPPERS = new Set(['ExportNamedDeclaration', 'ExportDefaultDeclaration']);

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
      return imported !== undefined && NEST_DECORATORS.has(imported);
    })
  );
}

export function routeHandlers(context, calls, frameworks) {
  const handlers = new Set();
  if (!frameworks) {
    return handlers;
  }
  for (const call of calls) {
    const route =
      call.callee.type === 'MemberExpression' && ROUTE_METHODS.has(memberName(call.callee));
    for (const argument of route ? call.arguments : []) {
      const handler = isFunctionNode(argument) ? argument : resolveFunction(context, argument);
      if (handler !== undefined) {
        handlers.add(handler);
      }
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

export function startupChecker(context) {
  const memo = new Map();
  const isStartup = (fn) => {
    if (memo.has(fn)) {
      return memo.get(fn);
    }
    memo.set(fn, true);
    const variable = boundVariable(context, fn);
    const references = (variable?.references ?? []).filter((reference) => !reference.init);
    const result =
      variable !== undefined &&
      !isExported(fn) &&
      references.length > 0 &&
      references.every((reference) => {
        const owner = nearestFunction(reference.identifier);
        return isInvocation(reference) && (owner === undefined || isStartup(owner));
      });
    memo.set(fn, result);
    return result;
  };
  return isStartup;
}

export function enclosingContext(call, { handlers, nestBindings }) {
  for (const fn of ancestorsOf(call).filter(isFunctionNode)) {
    if (fn.async) {
      return { kind: 'async', fn };
    }
    if (handlers.has(fn) || isNestHandler(fn, nestBindings)) {
      return { kind: 'handler', fn };
    }
    if (!isCallbackOf(fn, SYNCHRONOUS_CALLBACK_METHODS)) {
      return undefined;
    }
  }
  return undefined;
}
