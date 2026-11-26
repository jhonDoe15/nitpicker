import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { calledMember, memberName } from '../../collections/costly-forms/repeated-runs.mts';
import { ancestorsOf, chainOf } from '../../typed/node-views.mts';
import { isFunction } from '../../typed/syntax-views.mts';

const COPYING_CALLS = new Set(['Array.from', 'structuredClone', 'Buffer.from']);
const COPYING_CONSTRUCTORS = new Set(['Map', 'Set']);
const STORING_METHODS = new Set(['push', 'unshift', 'set', 'add']);

function soleSpread(
  elements: TSESTree.ArrayExpression['elements'] | TSESTree.ObjectExpression['properties'],
): TSESTree.Node | undefined {
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

function storedValue(copy: TSESTree.Node): TSESTree.Node {
  const values = chainOf<TSESTree.Node>(copy, (current) => {
    const property = current.parent;
    return property?.type === AST_NODE_TYPES.Property &&
      property.value === current &&
      property.parent.type === AST_NODE_TYPES.ObjectExpression
      ? property.parent
      : undefined;
  });
  return values.at(-1) ?? copy;
}

export function isStored(copy: TSESTree.Node, repeat: TSESTree.Node): boolean {
  const value = storedValue(copy);
  const { parent } = value;
  if (parent === undefined) {
    return false;
  }
  if (parent.type === AST_NODE_TYPES.AssignmentExpression) {
    return parent.right === value && parent.left.type === AST_NODE_TYPES.MemberExpression;
  }
  if (parent === repeat && parent.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.ReturnStatement) {
    return repeat.type !== AST_NODE_TYPES.ForOfStatement && innermostFunctionIs(parent, repeat);
  }
  return isStoringCall(parent, value);
}

function innermostFunctionIs(node: TSESTree.Node, fn: TSESTree.Node): boolean {
  return ancestorsOf(node).find(isFunction) === fn;
}
