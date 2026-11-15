import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { chainOf } from '../../typed/node-views.mts';

type Wrapper =
  | TSESTree.TSAsExpression
  | TSESTree.TSSatisfiesExpression
  | TSESTree.TSNonNullExpression
  | TSESTree.TSTypeAssertion
  | TSESTree.ChainExpression;

function isWrapper(node: TSESTree.Node): node is Wrapper {
  return (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion ||
    node.type === AST_NODE_TYPES.ChainExpression
  );
}

export function unwrap(node: TSESTree.Node): TSESTree.Node {
  return chainOf(node, (link) => (isWrapper(link) ? link.expression : undefined)).at(-1) ?? node;
}

export function propertyName(node: TSESTree.Node | undefined): string | undefined {
  if (node?.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  if (!node.computed && node.property.type === AST_NODE_TYPES.Identifier) {
    return node.property.name;
  }
  return node.property.type === AST_NODE_TYPES.Literal && typeof node.property.value === 'string'
    ? node.property.value
    : undefined;
}

export function calleeText(callee: TSESTree.Node): string | undefined {
  const links = chainOf(unwrap(callee), (link) =>
    link.type === AST_NODE_TYPES.MemberExpression && propertyName(link) !== undefined
      ? unwrap(link.object)
      : undefined,
  );
  const names = links
    .map((link) => (link.type === AST_NODE_TYPES.Identifier ? link.name : propertyName(link)))
    .filter((name) => name !== undefined);
  return names.length === 0 ? undefined : names.toReversed().join('.');
}
