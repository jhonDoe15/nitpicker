import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../analysis/constant-resolution.mts';
import { enclosingLoop } from '../loops/loop-shapes.mts';
import { hasArrayType } from '../support/checked-types.mts';
import { contains, nameOf } from '../typed/node-views.mts';

type FunctionNode = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
type MessageId = 'concat' | 'loopConcat';
type Docs = { readonly requiresTypeChecking: boolean };
type Context = Readonly<TSESLint.RuleContext<MessageId, []>>;
type LoopSite = {
  readonly loop?: TSESTree.Node | undefined;
  readonly callback?: TSESTree.Node | undefined;
};

const { DefinitionType } = TSESLint.Scope;

const REDUCERS = new Set(['reduce', 'reduceRight']);
function isFunction(node: TSESTree.Node | undefined): node is FunctionNode {
  return (
    node?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node?.type === AST_NODE_TYPES.FunctionExpression
  );
}

function reducerOf(call: TSESTree.CallExpression): FunctionNode | undefined {
  const [callback] = call.arguments;
  const method =
    call.callee.type === AST_NODE_TYPES.MemberExpression ? nameOf(call.callee.property) : undefined;
  const isReduce = method !== undefined && REDUCERS.has(method);
  return isReduce && isFunction(callback) && callback.params[0]?.type === AST_NODE_TYPES.Identifier
    ? callback
    : undefined;
}

function isConcatOf(value: TSESTree.Node, name: string): boolean {
  const callee = value.type === AST_NODE_TYPES.CallExpression ? value.callee : undefined;
  return (
    callee?.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === name &&
    nameOf(callee.property) === 'concat'
  );
}

function isArrayValue(
  context: Context,
  node: TSESTree.Node,
  start: TSESTree.Node | undefined,
): boolean {
  const typed = hasArrayType(context, node);
  return typed === 'unknown' ? start?.type === AST_NODE_TYPES.ArrayExpression : typed === 'yes';
}

function outsideDefinition(
  context: Context,
  target: TSESTree.Identifier,
  found: LoopSite,
): TSESLint.Scope.Definition | undefined {
  const scope = found.loop ?? found.callback;
  const definition = findVariable(context, target, target.name)?.defs[0];
  return scope !== undefined && definition !== undefined && !contains(scope, definition.name)
    ? definition
    : undefined;
}

function isLoopCopy(context: Context, node: TSESTree.AssignmentExpression): boolean {
  const { left, right, operator } = node;
  if (
    operator !== '=' ||
    left.type !== AST_NODE_TYPES.Identifier ||
    !isConcatOf(right, left.name)
  ) {
    return false;
  }
  const found = enclosingLoop(node, context);
  const definition = found && outsideDefinition(context, left, found);
  const start =
    definition?.type === DefinitionType.Variable ? (definition.node.init ?? undefined) : undefined;
  return definition !== undefined && isArrayValue(context, left, start);
}

function reducerStart(reducer: FunctionNode): TSESTree.Node | undefined {
  const call = reducer.parent;
  return call.type === AST_NODE_TYPES.CallExpression ? call.arguments[1] : undefined;
}

function isReduceConcat(
  context: Context,
  node: TSESTree.CallExpression,
  reducers: readonly FunctionNode[],
): boolean {
  const object =
    node.callee.type === AST_NODE_TYPES.MemberExpression ? node.callee.object : undefined;
  const reducer =
    object?.type === AST_NODE_TYPES.Identifier
      ? reducers.findLast((candidate) => contains(candidate, node))
      : undefined;
  const first = reducer?.params[0];
  const accumulator = first?.type === AST_NODE_TYPES.Identifier ? first.name : undefined;
  return (
    accumulator !== undefined &&
    object !== undefined &&
    reducer !== undefined &&
    isConcatOf(node, accumulator) &&
    isArrayValue(context, object, reducerStart(reducer))
  );
}

export const rule: TSESLint.RuleModule<MessageId, [], Docs> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Do not concatenate onto an accumulator array on every step of reduce or a loop',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      concat:
        'Concatenating onto the accumulator copies it on every step, so the work grows with the square of the list. Build the result in one pass (`flatMap`, `Object.fromEntries(items.map(...))`, `Object.groupBy`), or push into an array created before the loop. An exception fits only when the list is always tiny.',
      loopConcat:
        'This loop copies `{{name}}` with `concat` on every pass, so the work grows with the square of the list. Build the result in one pass (`flatMap`, `Object.fromEntries(items.map(...))`), or push into an array created before the loop. An exception fits only when the list is always tiny.',
    },
  },
  create(context) {
    const reducers: FunctionNode[] = [];
    return {
      CallExpression(node) {
        const reducer = reducerOf(node);
        if (reducer !== undefined) {
          reducers.push(reducer);
        }
        if (isReduceConcat(context, node, reducers)) {
          context.report({ node, messageId: 'concat' });
        }
      },
      AssignmentExpression(node) {
        if (isLoopCopy(context, node)) {
          context.report({ node, messageId: 'loopConcat', data: { name: nameOf(node.left) } });
        }
      },
    };
  },
};
