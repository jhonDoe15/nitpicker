import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { someNode } from '../../collections/costly-forms/repeated-runs.mts';
import { contains, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { isFixedTable } from './filtered-lists.mts';
import { isPlainPath, pathRoot } from '../support/plain-paths.mts';

function isOuterPartner(
  sourceCode: SourceCode,
  read: TSESTree.MemberExpression,
  area: TSESTree.Node,
): boolean {
  const root = pathRoot(read.object);
  const definition =
    root.type === AST_NODE_TYPES.Identifier ? variableNamed(sourceCode, root)?.defs[0] : undefined;
  const written =
    read.parent.type === AST_NODE_TYPES.AssignmentExpression && read.parent.left === read;
  return (
    !written &&
    !isFixedTable(sourceCode, read.object) &&
    (definition === undefined || !contains(area, definition.name))
  );
}

export function indexedLists(
  sourceCode: SourceCode,
  index: string,
  area: TSESTree.Node,
): TSESTree.Node[] {
  const found = new Map<string, TSESTree.Node>();
  someNode(area, (node) => {
    if (
      node.type === AST_NODE_TYPES.MemberExpression &&
      node.computed &&
      node.property.type === AST_NODE_TYPES.Identifier &&
      node.property.name === index &&
      isPlainPath(node.object) &&
      isOuterPartner(sourceCode, node, area)
    ) {
      found.set(sourceCode.getText(unwrapped(node.object)), node.object);
    }
    return false;
  });
  return [...found.values()];
}

function lengthOwner(node: TSESTree.Node): TSESTree.Node | undefined {
  return node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    node.property.name === 'length'
    ? node.object
    : undefined;
}

function lengthBound(
  test: TSESTree.Expression | null,
  index: string | undefined,
): TSESTree.Node | undefined {
  return test?.type === AST_NODE_TYPES.BinaryExpression &&
    test.operator === '<' &&
    test.left.type === AST_NODE_TYPES.Identifier &&
    test.left.name === index
    ? lengthOwner(test.right)
    : undefined;
}

export function countedLoop(
  loop: TSESTree.ForStatement,
): { readonly index: string; readonly bound: TSESTree.Node } | undefined {
  const { init, test } = loop;
  const [declarator] = init?.type === AST_NODE_TYPES.VariableDeclaration ? init.declarations : [];
  const index = declarator?.id.type === AST_NODE_TYPES.Identifier ? declarator.id.name : undefined;
  const bound = lengthBound(test, index);
  return index === undefined || bound === undefined ? undefined : { index, bound };
}
