import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, isFunctionNode, resolveFunction } from '../analysis/constant-resolution.mts';
import type { ModuleBindings } from '../security/imported-names.mts';
import { memberName, unwrapped, type Context } from '../security/security-values.mts';
import { ancestorsOf } from '../typed/node-views.mts';
import {
  FRAMEWORK_MODULES,
  NEST_DECORATORS,
  ROUTE_METHODS,
  SYNCHRONOUS_CALLBACK_METHODS,
} from './sync-node-apis.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;
type Handler = NonNullable<ReturnType<typeof resolveFunction>>;
type Reference = TSESLint.Scope.Reference;
export type EnclosingContext = { readonly kind: 'async' | 'handler'; readonly fn: FunctionNode };

const { DefinitionType } = TSESLint.Scope;
const EXPORT_WRAPPERS = new Set<string>([
  AST_NODE_TYPES.ExportNamedDeclaration,
  AST_NODE_TYPES.ExportDefaultDeclaration,
]);
const ROUTE_METHOD_NAMES = new Set(ROUTE_METHODS);
const NEST_DECORATOR_NAMES = new Set(NEST_DECORATORS);
const CALLBACK_METHOD_NAMES = new Set(SYNCHRONOUS_CALLBACK_METHODS);
const FRAMEWORK_MODULE_NAMES = new Set(FRAMEWORK_MODULES);

function chainStep(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.CallExpression || node.type === AST_NODE_TYPES.NewExpression) {
    return node.callee;
  }
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return node.object;
  }
  if (node.type === AST_NODE_TYPES.AwaitExpression) {
    return node.argument;
  }
  return node.type === AST_NODE_TYPES.TSQualifiedName ? node.left : undefined;
}

function nearestFunction(node: TSESTree.Node): FunctionNode | undefined {
  return ancestorsOf(node).find(isFunctionNode);
}

export function isDirectlyIn(node: TSESTree.Node, fn: FunctionNode): boolean {
  return nearestFunction(node) === fn;
}

function isCallbackOf(fn: FunctionNode, methods: ReadonlySet<string>): boolean {
  const call = fn.parent;
  return (
    call.type === AST_NODE_TYPES.CallExpression &&
    call.arguments.some((argument) => argument === fn) &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    methods.has(memberName(call.callee) ?? '')
  );
}

function decoratorName(decorator: TSESTree.Decorator): string | undefined {
  const expression = decorator.expression;
  const callee = expression.type === AST_NODE_TYPES.CallExpression ? expression.callee : expression;
  return callee.type === AST_NODE_TYPES.Identifier ? callee.name : undefined;
}

function isNestHandler(fn: FunctionNode, nestBindings: ModuleBindings): boolean {
  const method = fn.parent;
  return (
    method.type === AST_NODE_TYPES.MethodDefinition &&
    method.value === fn &&
    method.decorators.some((decorator) => {
      const name = decoratorName(decorator);
      const imported = name === undefined ? undefined : nestBindings.named.get(name);
      return imported !== undefined && NEST_DECORATOR_NAMES.has(imported);
    })
  );
}

function handlersIn(context: Context, argumentsList: readonly TSESTree.Node[]): Handler[] {
  return argumentsList
    .map((argument) => (isFunctionNode(argument) ? argument : resolveFunction(context, argument)))
    .filter((handler) => handler !== undefined);
}

export function frameworkNames(program: TSESTree.Program, bindings: ModuleBindings): Set<string> {
  const imported = program.body.flatMap((statement) =>
    statement.type === AST_NODE_TYPES.ImportDeclaration &&
    FRAMEWORK_MODULE_NAMES.has(statement.source.value)
      ? statement.specifiers.map((specifier) => specifier.local.name)
      : [],
  );
  return new Set([...bindings.named.keys(), ...bindings.namespaces, ...imported]);
}

function chainRoot(node: TSESTree.Node): TSESTree.Identifier | undefined {
  const chain = [unwrapped(node)];
  for (const current of chain) {
    const step = chainStep(current);
    if (step !== undefined) {
      chain.push(unwrapped(step));
    }
  }
  const root = chain.at(-1);
  return root?.type === AST_NODE_TYPES.Identifier ? root : undefined;
}

function declaredType(identifier: TSESTree.Node): TSESTree.Identifier | undefined {
  const annotation =
    identifier.type === AST_NODE_TYPES.Identifier ||
    identifier.type === AST_NODE_TYPES.ObjectPattern ||
    identifier.type === AST_NODE_TYPES.ArrayPattern ||
    identifier.type === AST_NODE_TYPES.RestElement
      ? identifier.typeAnnotation?.typeAnnotation
      : undefined;
  return annotation?.type === AST_NODE_TYPES.TSTypeReference
    ? chainRoot(annotation.typeName)
    : undefined;
}

function isFrameworkInstance(
  context: Context,
  receiver: TSESTree.Node,
  names: ReadonlySet<string>,
): boolean {
  const root = chainRoot(receiver);
  const definition =
    root === undefined ? undefined : findVariable(context, root, root.name)?.defs[0];
  if (definition?.type === DefinitionType.Variable && definition.node.init !== null) {
    return names.has(chainRoot(definition.node.init)?.name ?? '');
  }
  return (
    definition?.type === DefinitionType.Parameter &&
    names.has(declaredType(definition.name)?.name ?? '')
  );
}

function isRouteCall(
  context: Context,
  call: TSESTree.CallExpression,
  names: ReadonlySet<string>,
): boolean {
  const { callee } = call;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    ROUTE_METHOD_NAMES.has(memberName(callee) ?? '') &&
    isFrameworkInstance(context, callee.object, names)
  );
}

export function routeHandlers(
  context: Context,
  calls: readonly TSESTree.CallExpression[],
  names: ReadonlySet<string>,
): Set<Handler> {
  const handlers = new Set<Handler>();
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

function boundVariable(context: Context, fn: FunctionNode): TSESLint.Scope.Variable | undefined {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration && fn.id !== null) {
    return findVariable(context, fn.id, fn.id.name);
  }
  const declarator = fn.parent;
  return declarator.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.parent.kind === 'const' &&
    declarator.id.type === AST_NODE_TYPES.Identifier
    ? findVariable(context, declarator.id, declarator.id.name)
    : undefined;
}

function isExported(fn: FunctionNode): boolean {
  const declaration =
    fn.type === AST_NODE_TYPES.FunctionDeclaration ? fn : fn.parent.parent?.parent;
  return EXPORT_WRAPPERS.has(declaration?.parent?.type ?? '');
}

function isInvocation(reference: Reference): boolean {
  const call = reference.identifier.parent;
  return call.type === AST_NODE_TYPES.CallExpression && call.callee === reference.identifier;
}

function immediateCall(fn: FunctionNode): TSESTree.CallExpression | undefined {
  const call = fn.parent;
  return call.type === AST_NODE_TYPES.CallExpression && call.callee === fn ? call : undefined;
}

function callSites(context: Context, fn: FunctionNode): (FunctionNode | undefined)[] | undefined {
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

export function isStartupFunction(context: Context, fn: FunctionNode): boolean {
  const seen = new Set<FunctionNode>();
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
    appendAll(
      pending,
      owners.filter((owner) => owner !== undefined),
    );
  }
  return true;
}

export function enclosingContext(
  call: TSESTree.Node,
  {
    handlers,
    nestBindings,
  }: { readonly handlers: ReadonlySet<Handler>; readonly nestBindings: ModuleBindings },
): EnclosingContext | undefined {
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

function isMainThreadTest(test: TSESTree.Node, workerBindings: ModuleBindings): boolean {
  const target = unwrapped(test);
  if (target.type === AST_NODE_TYPES.Identifier) {
    return workerBindings.named.get(target.name) === 'isMainThread';
  }
  return (
    target.type === AST_NODE_TYPES.MemberExpression &&
    memberName(target) === 'isMainThread' &&
    target.object.type === AST_NODE_TYPES.Identifier &&
    workerBindings.namespaces.has(target.object.name)
  );
}

function workerSide(
  branching: TSESTree.IfStatement | TSESTree.ConditionalExpression,
  workerBindings: ModuleBindings,
): TSESTree.Node | undefined {
  const test = unwrapped(branching.test);
  if (test.type === AST_NODE_TYPES.UnaryExpression && test.operator === '!') {
    return isMainThreadTest(test.argument, workerBindings) ? branching.consequent : undefined;
  }
  return isMainThreadTest(test, workerBindings) ? (branching.alternate ?? undefined) : undefined;
}

export function isWorkerBranch(node: TSESTree.Node, workerBindings: ModuleBindings): boolean {
  const path = [node, ...ancestorsOf(node)];
  return path.some(
    (current, index) =>
      (current.type === AST_NODE_TYPES.IfStatement ||
        current.type === AST_NODE_TYPES.ConditionalExpression) &&
      index > 0 &&
      workerSide(current, workerBindings) === path[index - 1],
  );
}
