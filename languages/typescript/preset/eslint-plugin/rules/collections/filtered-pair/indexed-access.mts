import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { contains, nameOf, type Ranged } from '../../typed/node-views.mts';
import { outermostOf, TYPE_WRAPPERS, unwrapOf } from '../../typed/syntax-views.mts';

export type IndexedAccess = {
  readonly array: TSESTree.Expression;
  readonly access: TSESTree.Node;
};

function isPlainAssignmentTarget(node: TSESTree.Node): boolean {
  const { parent } = node;
  return (
    parent?.type === AST_NODE_TYPES.AssignmentExpression &&
    parent.operator === '=' &&
    parent.left === node
  );
}

function memberIndexedAccess(
  member: TSESTree.MemberExpression,
  indexNode: TSESTree.Node,
): IndexedAccess | undefined {
  if (!member.computed || member.property !== indexNode) {
    return undefined;
  }
  const outer = outermostOf(member, TYPE_WRAPPERS);
  return isPlainAssignmentTarget(outer) ? undefined : { array: member.object, access: member };
}

function atCallIndexedAccess(
  call: TSESTree.CallExpression,
  indexNode: TSESTree.Node,
): IndexedAccess | undefined {
  if (call.arguments[0] !== indexNode) {
    return undefined;
  }
  const callee = unwrapOf(call.callee, TYPE_WRAPPERS);
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    nameOf(callee.property) === 'at'
    ? { array: callee.object, access: call }
    : undefined;
}

function indexedAccessFromIdentifier(
  identifier: TSESTree.Identifier | TSESTree.JSXIdentifier,
): IndexedAccess | undefined {
  const outer = outermostOf(identifier, TYPE_WRAPPERS);
  const { parent } = outer;
  if (parent?.type === AST_NODE_TYPES.MemberExpression) {
    return memberIndexedAccess(parent, outer);
  }
  if (parent?.type === AST_NODE_TYPES.CallExpression) {
    return atCallIndexedAccess(parent, outer);
  }
  return undefined;
}

export function indexedAccessesOf(
  variable: TSESLint.Scope.Variable,
  container: Ranged,
): IndexedAccess[] {
  const accesses: IndexedAccess[] = [];
  for (const reference of variable.references) {
    if (!reference.isRead() || !contains(container, reference.identifier)) {
      continue;
    }
    const access = indexedAccessFromIdentifier(reference.identifier);
    if (access !== undefined) {
      accesses.push(access);
    }
  }
  return accesses;
}
