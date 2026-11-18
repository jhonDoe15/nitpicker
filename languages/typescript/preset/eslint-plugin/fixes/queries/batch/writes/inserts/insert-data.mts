import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { descendants } from '../../../../../rules/loops/loop-shapes.mts';
import { callEffects } from '../../../../../rules/support/io-effects.mts';
import { isInvariant } from '../../../loops/invariants.mts';
import type { WriteSite } from '../write-loop.mts';

const ALLOWED = new Set<string>([
  AST_NODE_TYPES.Identifier,
  AST_NODE_TYPES.Literal,
  AST_NODE_TYPES.ThisExpression,
  AST_NODE_TYPES.MemberExpression,
  AST_NODE_TYPES.ObjectExpression,
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.Property,
  AST_NODE_TYPES.TemplateLiteral,
  AST_NODE_TYPES.TemplateElement,
  AST_NODE_TYPES.UnaryExpression,
  AST_NODE_TYPES.BinaryExpression,
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.NewExpression,
]);

function isAllowed(site: WriteSite, node: TSESTree.Node): boolean {
  if (!ALLOWED.has(node.type)) {
    return false;
  }
  if (node.type === AST_NODE_TYPES.UnaryExpression) {
    return node.operator !== 'delete';
  }
  if (node.type === AST_NODE_TYPES.Property) {
    return node.kind === 'init' && !node.computed && !node.method;
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return callEffects(node, site.context).size === 0;
  }
  return true;
}

function isStableReference(site: WriteSite, node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return true;
  }
  const { sourceCode } = site.context;
  return isInvariant(sourceCode, node, site.repeated, site.loop.item.name);
}

export function isRowData(site: WriteSite, data: TSESTree.Node): boolean {
  const nodes = descendants(data, site.context.sourceCode.visitorKeys, () => false);
  return nodes.every((node) => isAllowed(site, node) && isStableReference(site, node));
}
