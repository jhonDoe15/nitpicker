import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../../../rules/analysis/constant-resolution.mts';
import { unwrapped, type Context } from '../../../rules/security/security-values.mts';
import { contains } from '../../../rules/typed/node-views.mts';

const MUTATORS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
]);
const FRESH = new Set<string>([
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.NewExpression,
]);

function calledName(member: TSESTree.MemberExpression): string | undefined {
  const { property } = member;
  if (!member.computed) {
    return property.type === AST_NODE_TYPES.Identifier ? property.name : undefined;
  }
  return property.type === AST_NODE_TYPES.Literal ? String(property.value) : undefined;
}

function isCalledMutator(member: TSESTree.MemberExpression, parent: TSESTree.Node): boolean {
  if (parent.type !== AST_NODE_TYPES.CallExpression || parent.callee !== member) {
    return false;
  }
  const name = calledName(member);
  return name === undefined ? member.computed : MUTATORS.has(name);
}

function isWriteTarget(member: TSESTree.MemberExpression, parent: TSESTree.Node): boolean {
  switch (parent.type) {
    case AST_NODE_TYPES.AssignmentExpression:
    case AST_NODE_TYPES.AssignmentPattern:
      return parent.left === member;
    case AST_NODE_TYPES.UpdateExpression:
    case AST_NODE_TYPES.ArrayPattern:
    case AST_NODE_TYPES.RestElement:
      return true;
    case AST_NODE_TYPES.UnaryExpression:
      return parent.operator === 'delete';
    case AST_NODE_TYPES.ForOfStatement:
    case AST_NODE_TYPES.ForInStatement:
      return parent.left === member;
    case AST_NODE_TYPES.Property:
      return parent.parent.type === AST_NODE_TYPES.ObjectPattern && parent.value === member;
    default:
      return false;
  }
}

function isReadOnlyUse(identifier: TSESTree.Identifier | TSESTree.JSXIdentifier): boolean {
  const { parent } = identifier;
  if (parent.type === AST_NODE_TYPES.MemberExpression && parent.object === identifier) {
    return !isCalledMutator(parent, parent.parent) && !isWriteTarget(parent, parent.parent);
  }
  if (parent.type === AST_NODE_TYPES.SpreadElement) {
    return parent.parent.type === AST_NODE_TYPES.ArrayExpression;
  }
  return parent.type === AST_NODE_TYPES.ForOfStatement && parent.right === identifier;
}

function isStableConstant(variable: TSESLint.Scope.Variable, callback: TSESTree.Node): boolean {
  const [definition] = variable.defs;
  return (
    variable.defs.length === 1 &&
    definition?.type === 'Variable' &&
    definition.parent.kind === 'const' &&
    variable.references.every(
      (reference) =>
        reference.init === true ||
        (reference.isRead() &&
          !reference.isWrite() &&
          !contains(callback, reference.identifier) &&
          isReadOnlyUse(reference.identifier)),
    )
  );
}

export function isStableReceiver(
  context: Context,
  { receiver, callback }: { readonly receiver: TSESTree.Node; readonly callback: TSESTree.Node },
): boolean {
  const target = unwrapped(receiver);
  if (FRESH.has(target.type)) {
    return true;
  }
  if (target.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const variable = findVariable(context, target, target.name);
  return variable !== undefined && isStableConstant(variable, callback);
}
