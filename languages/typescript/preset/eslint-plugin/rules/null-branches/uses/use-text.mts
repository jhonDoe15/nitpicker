import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../typed/node-views.mts';

const MAX_SHOWN = 40;

function usedExpression(node: TSESTree.Node): TSESTree.Node {
  const { parent } = node;
  if (parent === undefined) {
    return node;
  }
  const grand = parent.parent;
  const called =
    parent.type === AST_NODE_TYPES.MemberExpression &&
    grand?.type === AST_NODE_TYPES.CallExpression &&
    grand.callee === parent;
  return called ? grand : parent;
}

export function useText(node: TSESTree.Node, sourceCode: SourceCode): string {
  const expression = usedExpression(node);
  const text =
    expression.type === AST_NODE_TYPES.ForOfStatement
      ? `for (… of ${sourceCode.getText(node)})`
      : sourceCode.getText(expression).replace(/\s+/gu, ' ');
  return text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN)}...` : text;
}
