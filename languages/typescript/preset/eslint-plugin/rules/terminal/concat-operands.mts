import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

export function concatOperands(plain: TSESTree.Node): readonly TSESTree.Node[] | undefined {
  if (plain.type === AST_NODE_TYPES.TemplateLiteral) {
    return plain.expressions;
  }
  if (plain.type === AST_NODE_TYPES.BinaryExpression) {
    return plain.operator === '+' ? [plain.left, plain.right] : [];
  }
  return undefined;
}
