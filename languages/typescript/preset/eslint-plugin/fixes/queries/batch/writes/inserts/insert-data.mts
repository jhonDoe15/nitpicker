import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { descendants } from '../../../../../rules/loops/loop-shapes.mts';
import { callEffects } from '../../../../../rules/support/io-effects.mts';
import { isInvariant, PLAIN_NODE_TYPES } from '../../../loops/invariants.mts';
import type { WriteSite } from '../write-loop.mts';

const ALLOWED = new Set<string>([
  ...PLAIN_NODE_TYPES,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.ChainExpression,
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
  return isInvariant(sourceCode, node, { ...site.repeated, except: site.loop.item.name });
}

export function isRowData(site: WriteSite, data: TSESTree.Node): boolean {
  const nodes = descendants(data, site.context.sourceCode.visitorKeys, () => false);
  return nodes.every((node) => isAllowed(site, node) && isStableReference(site, node));
}
