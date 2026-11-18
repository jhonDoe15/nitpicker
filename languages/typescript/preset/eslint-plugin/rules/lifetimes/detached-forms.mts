import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, variableNamed, type SourceCode } from '../typed/node-views.mts';

type DetachedMessage = 'detached' | 'deferred' | 'unawaited' | 'returned';
export type DetachedForm = { readonly messageId: DetachedMessage; readonly node: TSESTree.Node };
type AwaitedForm = { readonly messageId: undefined };
type Step = { readonly child: TSESTree.Node; readonly direct: boolean };

const FUNCTION_TYPES = new Set<string>([
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionExpression,
]);
const TIMERS = new Set<string>(['setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask']);
const TIMER_OWNERS = new Set<string>(['globalThis', 'window', 'self', 'global']);
const FIRST_DEFERRED_ARGUMENT = 2;

function isTimer(callee: TSESTree.Expression): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return TIMERS.has(callee.name);
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    ((TIMER_OWNERS.has(callee.object.name) && TIMERS.has(nameOf(callee.property) ?? '')) ||
      (callee.object.name === 'process' && nameOf(callee.property) === 'nextTick'))
  );
}

function isDeferredArgument(call: TSESTree.CallExpression, child: TSESTree.Node): boolean {
  const index = call.arguments.findIndex((argument) => argument === child);
  return index >= 0 && (FUNCTION_TYPES.has(child.type) || index >= FIRST_DEFERRED_ARGUMENT);
}

function isAsyncFunction(node: TSESTree.Node | undefined): boolean {
  return (
    (node?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      node?.type === AST_NODE_TYPES.FunctionExpression) &&
    node.async
  );
}

function isAsyncCall(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  if (isAsyncFunction(call.callee)) {
    return true;
  }
  if (call.callee.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const definition = variableNamed(sourceCode, call.callee)?.defs.at(0);
  if (definition?.type === TSESLint.Scope.DefinitionType.FunctionName) {
    return definition.node.async;
  }
  return (
    definition?.type === TSESLint.Scope.DefinitionType.Variable &&
    isAsyncFunction(definition.node.init ?? undefined)
  );
}

function isUnread(sourceCode: SourceCode, declarator: TSESTree.VariableDeclarator): boolean {
  const [variable] = sourceCode.getDeclaredVariables(declarator);
  return variable !== undefined && variable.references.every(({ init }) => init);
}

function stored(
  sourceCode: SourceCode,
  parent: TSESTree.Node,
): 'returned' | 'unawaited' | undefined {
  if (parent.type === AST_NODE_TYPES.ReturnStatement) {
    return 'returned';
  }
  return parent.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id.type === AST_NODE_TYPES.Identifier &&
    isUnread(sourceCode, parent)
    ? 'unawaited'
    : undefined;
}

const FUNCTION_NODES = new Set<string>([AST_NODE_TYPES.FunctionDeclaration, ...FUNCTION_TYPES]);

function ownerFunction(sourceCode: SourceCode, node: TSESTree.Node): TSESTree.Node | undefined {
  return sourceCode.getAncestors(node).findLast((ancestor) => FUNCTION_NODES.has(ancestor.type));
}

const AWAITED: AwaitedForm = { messageId: undefined };

function formAt(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  step: Step,
): DetachedForm | AwaitedForm | undefined {
  if (node.type === AST_NODE_TYPES.AwaitExpression && step.direct) {
    return AWAITED;
  }
  if (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === 'void') {
    return { messageId: 'detached', node };
  }
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const messageId = callForm(sourceCode, node, step);
  return messageId === undefined ? undefined : { messageId, node };
}

function settlesAwaitedPromise(
  sourceCode: SourceCode,
  outer: readonly TSESTree.Node[],
  regionFunction: TSESTree.Node | undefined,
): boolean {
  const executor = outer.find((node) => FUNCTION_TYPES.has(node.type));
  const promise = executor?.parent;
  return (
    promise?.type === AST_NODE_TYPES.NewExpression &&
    promise.callee.type === AST_NODE_TYPES.Identifier &&
    promise.callee.name === 'Promise' &&
    promise.arguments[0] === executor &&
    promise.parent.type === AST_NODE_TYPES.AwaitExpression &&
    ownerFunction(sourceCode, promise.parent) === regionFunction
  );
}

export function detachedForm(
  sourceCode: SourceCode,
  identifier: TSESTree.Node,
  region: TSESTree.Node,
): DetachedForm | undefined {
  const regionFunction = ownerFunction(sourceCode, region);
  const chain = sourceCode.getAncestors(identifier).reverse();
  const end = chain.indexOf(region);
  const path = end < 0 ? chain : chain.slice(0, end);
  for (const [index, node] of path.entries()) {
    const child = path[index - 1] ?? identifier;
    const direct = ownerFunction(sourceCode, node) === regionFunction;
    const form = formAt(sourceCode, node, { child, direct });
    if (
      form?.messageId === 'deferred' &&
      settlesAwaitedPromise(sourceCode, path.slice(index + 1), regionFunction)
    ) {
      return undefined;
    }
    if (form !== undefined) {
      return form.messageId === undefined ? undefined : form;
    }
  }
  return undefined;
}

function callForm(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  { child, direct }: Step,
): DetachedMessage | undefined {
  if (isTimer(call.callee) && isDeferredArgument(call, child)) {
    return 'deferred';
  }
  return direct && isAsyncCall(sourceCode, call) ? stored(sourceCode, call.parent) : undefined;
}
