import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { someNode } from '../../collections/costly-forms/repeated-runs.mts';
import type { SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { isPlainList } from './filtered-lists.mts';

export function indexedLists(
  sourceCode: SourceCode,
  body: TSESTree.Node,
  index: string,
): TSESTree.Node[] {
  const found = new Map<string, TSESTree.Node>();
  someNode(body, (node) => {
    if (
      node.type === AST_NODE_TYPES.MemberExpression &&
      node.computed &&
      node.property.type === AST_NODE_TYPES.Identifier &&
      node.property.name === index &&
      isPlainList(node.object)
    ) {
      found.set(sourceCode.getText(unwrapped(node.object)), node.object);
    }
    return false;
  });
  return [...found.values()];
}

export function countedLoop(
  loop: TSESTree.ForStatement,
): { readonly index: string; readonly bound: TSESTree.Node } | undefined {
  const { init, test } = loop;
  const [declarator] = init?.type === AST_NODE_TYPES.VariableDeclaration ? init.declarations : [];
  if (
    declarator?.id.type !== AST_NODE_TYPES.Identifier ||
    test?.type !== AST_NODE_TYPES.BinaryExpression ||
    test.operator !== '<' ||
    test.left.type !== AST_NODE_TYPES.Identifier ||
    test.left.name !== declarator.id.name ||
    test.right.type !== AST_NODE_TYPES.MemberExpression ||
    test.right.computed ||
    test.right.property.type !== AST_NODE_TYPES.Identifier ||
    test.right.property.name !== 'length'
  ) {
    return undefined;
  }
  return { index: declarator.id.name, bound: test.right.object };
}
