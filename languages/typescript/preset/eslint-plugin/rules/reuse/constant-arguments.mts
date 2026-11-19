import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, type SourceContext } from '../analysis/constant-resolution.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';
import { globalName, type Call } from './construction-kinds.mts';

type Part = TSESTree.Node | TSESTree.ArrayExpression['elements'][number] | undefined;

const MAX_PARTS = 50;

function parts(node: TSESTree.Node): readonly Part[] {
  if (node.type === AST_NODE_TYPES.ArrayExpression) {
    return node.elements;
  }
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    return node.properties.map((entry) =>
      entry.type === AST_NODE_TYPES.Property && !entry.computed ? entry.value : undefined,
    );
  }
  if (node.type === AST_NODE_TYPES.UnaryExpression) {
    return [node.argument];
  }
  return node.type === AST_NODE_TYPES.TemplateLiteral ? node.expressions : [];
}

function leafConstant(context: SourceContext, node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.Literal ||
    node.type === AST_NODE_TYPES.TemplateLiteral ||
    node.type === AST_NODE_TYPES.ArrayExpression ||
    node.type === AST_NODE_TYPES.ObjectExpression ||
    node.type === AST_NODE_TYPES.UnaryExpression ||
    globalName(context, node, 'undefined')
  );
}

export function constantList(context: SourceContext, nodes: readonly Part[]): boolean {
  const pending: Part[] = [...nodes];
  for (const current of pending) {
    const value =
      current === undefined || current === null ? undefined : resolveConstant(context, current);
    if (value === undefined || !leafConstant(context, value) || pending.length > MAX_PARTS) {
      return false;
    }
    appendAll(pending, parts(value));
  }
  return true;
}

export function constantArguments(context: SourceContext, node: Call): boolean {
  return constantList(context, node.arguments);
}

export function usesDefaultLocale(context: SourceContext, node: Call): boolean {
  const [locale] = node.arguments;
  if (locale === undefined) {
    return true;
  }
  const value = resolveConstant(context, locale);
  return (
    value !== undefined &&
    (globalName(context, value, 'undefined') ||
      (value.type === AST_NODE_TYPES.ArrayExpression && value.elements.length === 0))
  );
}
