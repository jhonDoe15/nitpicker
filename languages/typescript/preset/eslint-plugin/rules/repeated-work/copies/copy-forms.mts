import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { calledMember, memberName } from '../../collections/costly-forms/repeated-runs.mts';
import { ancestorsOf } from '../../typed/node-views.mts';
import { isFunction } from '../../typed/syntax-views.mts';

const COPYING_CALLS = new Set(['Array.from', 'structuredClone', 'Buffer.from']);
const COPYING_CONSTRUCTORS = new Set(['Map', 'Set']);
const STORING_METHODS = new Set(['push', 'unshift', 'set', 'add']);

function soleSpread(elements: readonly (TSESTree.Node | null)[]): TSESTree.Node | undefined {
  const [first] = elements;
  return elements.length === 1 && first?.type === AST_NODE_TYPES.SpreadElement
    ? first.argument
    : undefined;
}

function dottedName(callee: TSESTree.Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.property.type === AST_NODE_TYPES.Identifier
    ? `${callee.object.name}.${callee.property.name}`
    : undefined;
}

function callSource(node: TSESTree.CallExpression): TSESTree.Node | undefined {
  const [first] = node.arguments;
  if (first === undefined || first.type === AST_NODE_TYPES.SpreadElement) {
    return undefined;
  }
  if (node.arguments.length === 1 && COPYING_CALLS.has(dottedName(node.callee) ?? '')) {
    return first;
  }
  return undefined;
}

export function copiedSource(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.ArrayExpression) {
    return soleSpread(node.elements);
  }
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    return soleSpread(node.properties);
  }
  if (node.type === AST_NODE_TYPES.NewExpression) {
    const [first] = node.arguments;
    return node.callee.type === AST_NODE_TYPES.Identifier &&
      COPYING_CONSTRUCTORS.has(node.callee.name) &&
      node.arguments.length === 1 &&
      first?.type !== AST_NODE_TYPES.SpreadElement
      ? first
      : undefined;
  }
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const member = calledMember(node);
  if (member !== undefined && memberName(member) === 'slice' && node.arguments.length === 0) {
    return member.object;
  }
  return callSource(node);
}

export function isPlainSource(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return true;
  }
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    (node.object.type === AST_NODE_TYPES.ThisExpression || isPlainSource(node.object))
  );
}

function isStoringCall(parent: TSESTree.Node, child: TSESTree.Node): boolean {
  if (parent.type === AST_NODE_TYPES.NewExpression) {
    return parent.arguments.some((argument) => argument === child);
  }
  if (parent.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const member = calledMember(parent);
  return (
    member !== undefined &&
    STORING_METHODS.has(memberName(member) ?? '') &&
    parent.arguments.at(-1) === child
  );
}

export function isStored(copy: TSESTree.Node, repeat: TSESTree.Node): boolean {
  const { parent } = copy;
  if (parent === undefined) {
    return false;
  }
  if (parent.type === AST_NODE_TYPES.Property) {
    return (
      parent.value === copy &&
      parent.parent.type === AST_NODE_TYPES.ObjectExpression &&
      isStored(parent.parent, repeat)
    );
  }
  if (parent.type === AST_NODE_TYPES.AssignmentExpression) {
    return parent.right === copy && parent.left.type === AST_NODE_TYPES.MemberExpression;
  }
  if (parent === repeat && parent.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.ReturnStatement) {
    return repeat.type !== AST_NODE_TYPES.ForOfStatement && innermostFunctionIs(parent, repeat);
  }
  return isStoringCall(parent, copy);
}

function innermostFunctionIs(node: TSESTree.Node, fn: TSESTree.Node): boolean {
  return ancestorsOf(node).find(isFunction) === fn;
}
