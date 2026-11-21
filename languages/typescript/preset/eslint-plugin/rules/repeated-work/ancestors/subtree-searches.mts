import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName, someNode } from '../../collections/costly-forms/repeated-runs.mts';
import { unwrapped } from '../../typed/syntax-views.mts';

const SUBTREE_CALLS = new Set([
  'descendants',
  'findAll',
  'forEachChild',
  'getElementsByClassName',
  'getElementsByTagName',
  'querySelector',
  'querySelectorAll',
  'traverse',
]);
const CHILD_LISTS = new Set(['childNodes', 'children']);
const CHILD_CALLS = new Set(['getChildren']);
const ITERATIONS = new Set([
  'every',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'forEach',
  'includes',
  'indexOf',
  'map',
  'reduce',
  'some',
]);

function isLevel(node: TSESTree.Node, name: string): boolean {
  const value = unwrapped(node);
  return value.type === AST_NODE_TYPES.Identifier && value.name === name;
}

function childList(node: TSESTree.Node, name: string): boolean {
  const value = unwrapped(node);
  if (value.type === AST_NODE_TYPES.MemberExpression) {
    return CHILD_LISTS.has(memberName(value) ?? '') && isLevel(value.object, name);
  }
  if (value.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = unwrapped(value.callee);
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    CHILD_CALLS.has(memberName(callee) ?? '') &&
    isLevel(callee.object, name)
  );
}

function iteratedList(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.ForOfStatement) {
    return node.right;
  }
  if (node.type === AST_NODE_TYPES.SpreadElement) {
    return node.argument;
  }
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const callee = unwrapped(node.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const method = memberName(callee) ?? '';
  if (method === 'from' && isLevel(callee.object, 'Array')) {
    return node.arguments[0];
  }
  return ITERATIONS.has(method) ? callee.object : undefined;
}

function subtreeCall(node: TSESTree.Node, name: string): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = unwrapped(node.callee);
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    const method = memberName(callee) ?? '';
    const [first] = node.arguments;
    return (
      SUBTREE_CALLS.has(method) &&
      (isLevel(callee.object, name) ||
        (method === 'forEachChild' && first !== undefined && isLevel(first, name)))
    );
  }
  return false;
}

function isSubtreeSearch(node: TSESTree.Node, name: string): boolean {
  const list = iteratedList(node);
  return subtreeCall(node, name) || (list !== undefined && childList(list, name));
}

export function subtreeSearches(body: TSESTree.Node, name: string): TSESTree.Node[] {
  const found: TSESTree.Node[] = [];
  someNode(body, (node) => {
    if (isSubtreeSearch(node, name)) {
      found.push(node);
    }
    return false;
  });
  return found;
}

export function searchShown(node: TSESTree.Node): TSESTree.Node {
  if (node.type === AST_NODE_TYPES.ForOfStatement || node.type === AST_NODE_TYPES.SpreadElement) {
    return iteratedList(node) ?? node;
  }
  return node;
}
