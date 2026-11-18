import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../../../rules/analysis/constant-resolution.mts';
import type { Context } from '../../../rules/security/security-values.mts';
import { ancestorsOf, contains } from '../../../rules/typed/node-views.mts';
import { containsNode } from '../../support/nodes.mts';

type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

const SHARED_INITIALIZERS = new Set<string>([
  AST_NODE_TYPES.NewExpression,
  AST_NODE_TYPES.ObjectExpression,
  AST_NODE_TYPES.ArrayExpression,
]);

const STATE_READERS = new Set(['has', 'get', 'set', 'add', 'delete']);
const STATE_WRITERS = new Set(['set', 'add']);

function rootOf(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  while (current.type === AST_NODE_TYPES.MemberExpression) {
    current = current.object;
  }
  return current;
}

function isSharedState(variable: TSESLint.Scope.Variable): boolean {
  const definition = variable.defs[0];
  if (definition?.type !== 'Variable') {
    return false;
  }
  const { init } = definition.node;
  return (
    definition.parent.kind !== 'const' || (init !== null && SHARED_INITIALIZERS.has(init.type))
  );
}

function isOutside(variable: TSESLint.Scope.Variable, fn: FunctionNode): boolean {
  return !contains(fn, variable.scope.block);
}

function isReceiverOf(node: TSESTree.Node, methods: ReadonlySet<string>): boolean {
  const member: TSESTree.Node | undefined = node.parent;
  const call: TSESTree.Node | undefined = member?.parent;
  return (
    member?.type === AST_NODE_TYPES.MemberExpression &&
    member.object === node &&
    !member.computed &&
    member.property.type === AST_NODE_TYPES.Identifier &&
    methods.has(member.property.name) &&
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.callee === member
  );
}

function usesOuterReceiver(
  context: Context,
  node: TSESTree.Node,
  { fn, methods }: { fn: FunctionNode; methods: ReadonlySet<string> },
): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier || !isReceiverOf(node, methods)) {
    return false;
  }
  const variable = findVariable(context, node, node.name);
  return variable !== undefined && isOutside(variable, fn);
}

function sharesState(context: Context, node: TSESTree.Node, fn: FunctionNode): boolean {
  const root = rootOf(node);
  if (root.type === AST_NODE_TYPES.ThisExpression) {
    return true;
  }
  if (root.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const variable = findVariable(context, root, root.name);
  return variable !== undefined && isOutside(variable, fn) && isSharedState(variable);
}

function guardsOnSharedState(context: Context, test: TSESTree.Node, fn: FunctionNode): boolean {
  return containsNode(context.sourceCode, test, {
    intoFunctions: false,
    matches: (node) =>
      usesOuterReceiver(context, node, { fn, methods: STATE_READERS }) ||
      ((node.type === AST_NODE_TYPES.Identifier || node.type === AST_NODE_TYPES.ThisExpression) &&
        sharesState(context, node, fn)),
  });
}

function storesIntoOuterState(
  context: Context,
  { call, fn, owner }: { call: TSESTree.Node; fn: FunctionNode; owner: TSESTree.Node },
): boolean {
  if (
    owner.type !== AST_NODE_TYPES.CallExpression ||
    owner.callee.type !== AST_NODE_TYPES.MemberExpression
  ) {
    return false;
  }
  const { callee } = owner;
  return (
    owner.arguments.some((argument) => contains(argument, call)) &&
    usesOuterReceiver(context, callee.object, { fn, methods: STATE_WRITERS })
  );
}

function readsThenWritesAround(
  context: Context,
  { call, fn }: { call: TSESTree.Node; fn: FunctionNode },
): boolean {
  const byVariable = new Map<TSESLint.Scope.Variable, TSESLint.Scope.Reference[]>();
  for (const reference of context.sourceCode.getScope(fn).through) {
    const { resolved } = reference;
    if (resolved !== null) {
      byVariable.set(resolved, [...(byVariable.get(resolved) ?? []), reference]);
    }
  }
  return [...byVariable.values()].some(
    (references) =>
      references.some(
        (reference) => reference.isRead() && reference.identifier.range[1] <= call.range[0],
      ) &&
      references.some(
        (reference) => reference.isWrite() && reference.identifier.range[0] >= call.range[1],
      ),
  );
}

function assignsToSharedState(
  context: Context,
  { call, fn, owner }: { call: TSESTree.Node; fn: FunctionNode; owner: TSESTree.Node },
): boolean {
  return (
    owner.type === AST_NODE_TYPES.AssignmentExpression &&
    contains(owner.right, call) &&
    sharesState(context, owner.left, fn)
  );
}

function guardTest(owner: TSESTree.Node, call: TSESTree.Node): TSESTree.Node | undefined {
  const isGuarded =
    (owner.type === AST_NODE_TYPES.IfStatement ||
      owner.type === AST_NODE_TYPES.ConditionalExpression) &&
    !contains(owner.test, call);
  if (isGuarded) {
    return owner.test;
  }
  return owner.type === AST_NODE_TYPES.LogicalExpression && !contains(owner.left, call)
    ? owner.left
    : undefined;
}

export function isStampede(context: Context, call: TSESTree.Node, fn: FunctionNode): boolean {
  const chain = ancestorsOf(call);
  const owners = chain.slice(0, chain.indexOf(fn));
  return (
    readsThenWritesAround(context, { call, fn }) ||
    owners.some((owner) => {
      const test = guardTest(owner, call);
      return (
        assignsToSharedState(context, { call, fn, owner }) ||
        storesIntoOuterState(context, { call, fn, owner }) ||
        (test !== undefined && guardsOnSharedState(context, test, fn))
      );
    })
  );
}
