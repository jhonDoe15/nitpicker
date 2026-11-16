import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { chainOf } from '../../typed/node-views.mts';
import { TYPE_ASSERTIONS, unwrapOf } from '../../typed/syntax-views.mts';

const WRAPPERS = [
  ...TYPE_ASSERTIONS,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.ChainExpression,
];

export function unwrap(node: TSESTree.Node): TSESTree.Node {
  return unwrapOf(node, WRAPPERS);
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
