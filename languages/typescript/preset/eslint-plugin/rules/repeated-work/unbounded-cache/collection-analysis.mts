import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName } from '../../collections/costly-forms/repeated-runs.mts';
import {
  ancestorsOf,
  depthFirst,
  nodeChildren,
  outermostWrapper,
} from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';

export type WriteSite = {
  readonly node: TSESTree.Node;
  readonly payloads: readonly TSESTree.Node[];
};

const COLLECTION_CONSTRUCTORS = new Set(['Map', 'WeakMap', 'Set']);
const SINGLE_ARG_WRITE_METHODS = new Set(['push', 'add']);
const SHRINK_METHODS = new Set(['delete', 'clear', 'pop', 'shift', 'splice']);
const COMPARISON_OPERATORS = new Set(['>', '>=', '<', '<=', '===', '!==', '==', '!=']);
const OBJECT_SIZE_METHODS = new Set(['keys', 'values', 'entries']);
const OUTER_WRAPPERS = new Set<string>([
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.ChainExpression,
]);
const NESTED_CLASS_TYPES = new Set<string>([
  AST_NODE_TYPES.ClassDeclaration,
  AST_NODE_TYPES.ClassExpression,
]);

function isObjectCreateNull(node: TSESTree.CallExpression): boolean {
  const callee = unwrapped(node.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const [first] = node.arguments;
  return (
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Object' &&
    memberName(callee) === 'create' &&
    first?.type === AST_NODE_TYPES.Literal &&
    first.value === null
  );
}

export function isCollectionInitializer(node: TSESTree.Node | null | undefined): boolean {
  if (node === null || node === undefined) {
    return false;
  }
  const value = unwrapped(node);
  if (
    value.type === AST_NODE_TYPES.ArrayExpression ||
    value.type === AST_NODE_TYPES.ObjectExpression
  ) {
    return true;
  }
  if (value.type === AST_NODE_TYPES.NewExpression) {
    return (
      value.callee.type === AST_NODE_TYPES.Identifier &&
      COLLECTION_CONSTRUCTORS.has(value.callee.name)
    );
  }
  return value.type === AST_NODE_TYPES.CallExpression && isObjectCreateNull(value);
}

function memberWriteSite(member: TSESTree.MemberExpression): WriteSite | undefined {
  const name = memberName(member);
  const parent = member.parent;
  if (parent?.type === AST_NODE_TYPES.CallExpression && parent.callee === member) {
    if (name === 'set' && parent.arguments.length >= 2) {
      return { node: parent, payloads: parent.arguments };
    }
    if (name !== undefined && SINGLE_ARG_WRITE_METHODS.has(name) && parent.arguments.length >= 1) {
      return { node: parent, payloads: parent.arguments };
    }
  }
  if (
    member.computed &&
    parent?.type === AST_NODE_TYPES.AssignmentExpression &&
    parent.left === member
  ) {
    return { node: parent, payloads: [member.property, parent.right] };
  }
  return undefined;
}

export function collectionWriteSite(target: TSESTree.Node): WriteSite | undefined {
  const outer = outermostWrapper(target, OUTER_WRAPPERS);
  const parent = outer.parent;
  if (parent?.type === AST_NODE_TYPES.MemberExpression && parent.object === outer) {
    return memberWriteSite(parent);
  }
  return undefined;
}

function isSizeComparison(node: TSESTree.Node): boolean {
  const parent = node.parent;
  return (
    parent?.type === AST_NODE_TYPES.BinaryExpression && COMPARISON_OPERATORS.has(parent.operator)
  );
}

function isObjectKeysSizeBound(outer: TSESTree.Node): boolean {
  const call = outer.parent;
  if (call?.type !== AST_NODE_TYPES.CallExpression || call.arguments[0] !== outer) {
    return false;
  }
  const callee = unwrapped(call.callee);
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.object.type !== AST_NODE_TYPES.Identifier ||
    callee.object.name !== 'Object' ||
    !OBJECT_SIZE_METHODS.has(memberName(callee) ?? '')
  ) {
    return false;
  }
  const lengthAccess = call.parent;
  return (
    lengthAccess?.type === AST_NODE_TYPES.MemberExpression &&
    memberName(lengthAccess) === 'length' &&
    isSizeComparison(lengthAccess)
  );
}

function isMemberShrinkOrBound(member: TSESTree.MemberExpression): boolean {
  const name = memberName(member);
  const parent = member.parent;
  if (
    parent?.type === AST_NODE_TYPES.CallExpression &&
    parent.callee === member &&
    name !== undefined &&
    SHRINK_METHODS.has(name)
  ) {
    return true;
  }
  if (parent?.type === AST_NODE_TYPES.UnaryExpression && parent.operator === 'delete') {
    return true;
  }
  if (
    name === 'length' &&
    parent?.type === AST_NODE_TYPES.AssignmentExpression &&
    parent.left === member
  ) {
    return true;
  }
  return (name === 'size' || name === 'length') && isSizeComparison(member);
}

export function isCollectionShrinkOrBound(target: TSESTree.Node): boolean {
  const outer = outermostWrapper(target, OUTER_WRAPPERS);
  const parent = outer.parent;
  if (parent?.type === AST_NODE_TYPES.AssignmentExpression && parent.left === outer) {
    return true;
  }
  if (parent?.type === AST_NODE_TYPES.MemberExpression && parent.object === outer) {
    return isMemberShrinkOrBound(parent);
  }
  return isObjectKeysSizeBound(outer);
}

export function isConstructorInit(member: TSESTree.MemberExpression): boolean {
  const parent = member.parent;
  if (
    parent?.type !== AST_NODE_TYPES.AssignmentExpression ||
    parent.left !== member ||
    !isCollectionInitializer(parent.right)
  ) {
    return false;
  }
  return ancestorsOf(member).some(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.MethodDefinition && ancestor.kind === 'constructor',
  );
}

export function classFieldReferences(
  classBody: TSESTree.ClassBody,
  fieldName: string,
): TSESTree.MemberExpression[] {
  const refs: TSESTree.MemberExpression[] = [];
  for (const node of depthFirst<TSESTree.Node>(classBody, (current) =>
    current !== classBody && NESTED_CLASS_TYPES.has(current.type) ? [] : nodeChildren(current),
  )) {
    if (
      node.type === AST_NODE_TYPES.MemberExpression &&
      node.object.type === AST_NODE_TYPES.ThisExpression &&
      memberName(node) === fieldName
    ) {
      refs.push(node);
    }
  }
  return refs;
}

export function isExportedDeclarator(declarator: TSESTree.VariableDeclarator): boolean {
  return declarator.parent.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration;
}
