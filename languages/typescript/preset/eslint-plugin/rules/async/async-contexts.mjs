import { ancestorsOf } from '../analysis/ancestry.mjs';
import { findVariable, isFunctionNode, resolveFunction } from '../analysis/constant-resolution.mjs';
import { memberName, unwrapped } from '../security/security-values.mjs';
import {
  FRAMEWORK_MODULES,
  NEST_DECORATORS,
  ROUTE_METHODS,
  SYNCHRONOUS_CALLBACK_METHODS,
} from './sync-node-apis.mjs';

const EXPORT_WRAPPERS = new Set(['ExportNamedDeclaration', 'ExportDefaultDeclaration']);
const ROUTE_METHOD_NAMES = new Set(ROUTE_METHODS);
const NEST_DECORATOR_NAMES = new Set(NEST_DECORATORS);
const CALLBACK_METHOD_NAMES = new Set(SYNCHRONOUS_CALLBACK_METHODS);
const FRAMEWORK_MODULE_NAMES = new Set(FRAMEWORK_MODULES);
const CHAIN_STEPS = {
  CallExpression: (node) => node.callee,
  NewExpression: (node) => node.callee,
  MemberExpression: (node) => node.object,
  AwaitExpression: (node) => node.argument,
  TSQualifiedName: (node) => node.left,
};

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

export function frameworkNames(program, bindings) {
  const imported = program.body
    .filter(
      (statement) =>
        statement.type === 'ImportDeclaration' &&
        FRAMEWORK_MODULE_NAMES.has(statement.source.value),
    )
    .flatMap((statement) => statement.specifiers.map((specifier) => specifier.local.name));
  return new Set([...bindings.named.keys(), ...bindings.namespaces, ...imported]);
}

function chainRoot(node) {
  const chain = [unwrapped(node)];
  for (const current of chain) {
    const step = CHAIN_STEPS[current?.type];
    if (step !== undefined) {
      chain.push(unwrapped(step(current)));
    }
  }
  const root = chain.at(-1);
  return root?.type === 'Identifier' ? root : undefined;
}

function declaredType(identifier) {
  const annotation = identifier.typeAnnotation?.typeAnnotation;
  return annotation?.type === 'TSTypeReference' ? chainRoot(annotation.typeName) : undefined;
}

function isFrameworkInstance(context, receiver, names) {
  const root = chainRoot(receiver);
  const definition =
    root === undefined ? undefined : findVariable(context, root, root.name)?.defs[0];
  if (definition?.type === 'Variable' && definition.node.init !== null) {
    return names.has(chainRoot(definition.node.init)?.name);
  }
  return definition?.type === 'Parameter' && names.has(declaredType(definition.name)?.name);
}

function isRouteCall(context, call, names) {
  const { callee } = call;
  return (
    callee.type === 'MemberExpression' &&
    ROUTE_METHOD_NAMES.has(memberName(callee)) &&
    isFrameworkInstance(context, callee.object, names)
  );
}

export function routeHandlers(context, calls, names) {
  const handlers = new Set();
  if (names.size === 0) {
    return handlers;
  }
  for (const call of calls.filter((candidate) => isRouteCall(context, candidate, names))) {
    for (const handler of handlersIn(context, call.arguments)) {
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

function immediateCall(fn) {
  const call = fn.parent;
  return call?.type === 'CallExpression' && call.callee === fn ? call : undefined;
}

function callSites(context, fn) {
  const invocation = immediateCall(fn);
  if (invocation !== undefined) {
    return [nearestFunction(invocation)];
  }
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

function isMainThreadTest(test, workerBindings) {
  const target = unwrapped(test);
  if (target?.type === 'Identifier') {
    return workerBindings.named.get(target.name) === 'isMainThread';
  }
  return (
    target?.type === 'MemberExpression' &&
    memberName(target) === 'isMainThread' &&
    target.object.type === 'Identifier' &&
    workerBindings.namespaces.has(target.object.name)
  );
}

function workerSide(branching, workerBindings) {
  const test = unwrapped(branching.test);
  if (test?.type === 'UnaryExpression' && test.operator === '!') {
    return isMainThreadTest(test.argument, workerBindings) ? branching.consequent : undefined;
  }
  return isMainThreadTest(test, workerBindings) ? branching.alternate : undefined;
}

export function isWorkerBranch(node, workerBindings) {
  const path = [node, ...ancestorsOf(node)];
  return path.some(
    (current, index) =>
      (current.type === 'IfStatement' || current.type === 'ConditionalExpression') &&
      index > 0 &&
      workerSide(current, workerBindings) === path[index - 1],
  );
}
