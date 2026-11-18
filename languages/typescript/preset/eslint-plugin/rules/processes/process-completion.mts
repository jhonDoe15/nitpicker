import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  isFunctionNode,
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { importedCalleeName, type ModuleBindings } from '../analysis/subprocess-calls.mts';
import { memberName } from '../analysis/test-code-analysis.mts';
import { ancestorsOf, chainOf, variableNamed } from '../typed/node-views.mts';

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

function isEndEvent(context: SourceContext, node: TSESTree.Node | undefined): boolean {
  const value = stringValue(resolveConstant(context, node));
  return value !== undefined && END_EVENTS.has(value);
}

function insidePromiseExecutor(node: TSESTree.Node): boolean {
  const executor = ancestorsOf(node).find(isFunctionNode);
  const parent = executor?.parent;
  return (
    parent?.type === AST_NODE_TYPES.NewExpression &&
    parent.callee.type === AST_NODE_TYPES.Identifier &&
    parent.callee.name === 'Promise' &&
    parent.arguments[0] === executor
  );
}

function listenerCall(emitter: TSESTree.Node): TSESTree.CallExpression | undefined {
  const member = emitter.parent;
  const call = member?.parent;
  return member?.type === AST_NODE_TYPES.MemberExpression &&
    member.object === emitter &&
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.callee === member &&
    LISTENERS.has(memberName(member) ?? '')
    ? call
    : undefined;
}

function listensForEnd(context: SourceContext, emitter: TSESTree.Node): boolean {
  const listeners = chainOf(listenerCall(emitter), listenerCall);
  return listeners.some(
    (call) => isEndEvent(context, call.arguments[0]) && insidePromiseExecutor(call),
  );
}

function isOnceCall(context: SourceContext, use: TSESTree.Node, events: ModuleBindings): boolean {
  const call = use.parent;
  return (
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.arguments[0] === use &&
    importedCalleeName(call.callee, events) === 'once' &&
    isEndEvent(context, call.arguments[1])
  );
}

function escapes(context: SourceContext, use: TSESTree.Node, events: ModuleBindings): boolean {
  const parent = use.parent;
  if (parent?.type === AST_NODE_TYPES.MemberExpression && parent.object === use) {
    return memberName(parent) === 'kill';
  }
  if (
    parent?.type === AST_NODE_TYPES.CallExpression ||
    parent?.type === AST_NODE_TYPES.NewExpression
  ) {
    return parent.callee !== use && !isOnceCall(context, use, events);
  }
  return parent !== undefined && ESCAPING_PARENTS.has(parent.type);
}

function heldChild(context: SourceContext, call: TSESTree.Node): TSESTree.Node[] | undefined {
  const declarator = call.parent;
  if (
    declarator?.type !== AST_NODE_TYPES.VariableDeclarator ||
    declarator.init !== call ||
    declarator.id.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  const variable = variableNamed(context.sourceCode, declarator.id);
  return variable?.references.filter((reference) => !reference.init).map((ref) => ref.identifier);
}

export function waitsForChildEnd(
  context: SourceContext,
  call: TSESTree.Node,
  events: ModuleBindings,
): boolean {
  const uses =
    call.parent?.type === AST_NODE_TYPES.VariableDeclarator ? heldChild(context, call) : [call];
  if (uses === undefined || uses.some((use) => escapes(context, use, events))) {
    return false;
  }
  return uses.some((use) => listensForEnd(context, use) || isOnceCall(context, use, events));
}

function isThenTarget(node: TSESTree.Node): boolean {
  return (
    node.parent?.type === AST_NODE_TYPES.MemberExpression &&
    node.parent.object === node &&
    memberName(node.parent) === 'then'
  );
}

function isAwaitedValue(node: TSESTree.Node): boolean {
  return node.parent?.type === AST_NODE_TYPES.AwaitExpression || isThenTarget(node);
}

export function isAwaited(context: SourceContext, call: TSESTree.Node): boolean {
  if (isAwaitedValue(call)) {
    return true;
  }
  const uses =
    call.parent?.type === AST_NODE_TYPES.VariableDeclarator ? heldChild(context, call) : [];
  return (uses ?? []).some(isAwaitedValue);
}
