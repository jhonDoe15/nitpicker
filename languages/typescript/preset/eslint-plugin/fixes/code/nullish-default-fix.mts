import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { hasCommentIn, replacing, type FixPlan } from '../support/ranges.mts';

const SIMPLE_FALLBACKS = new Set<string>([
  AST_NODE_TYPES.Literal,
  AST_NODE_TYPES.Identifier,
  AST_NODE_TYPES.MemberExpression,
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.NewExpression,
  AST_NODE_TYPES.TemplateLiteral,
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.ObjectExpression,
]);

function orDefault(
  sourceCode: SourceCode,
  expression: TSESTree.LogicalExpression,
): FixPlan | undefined {
  const mixesOperators =
    expression.right.type === AST_NODE_TYPES.LogicalExpression ||
    expression.parent.type === AST_NODE_TYPES.LogicalExpression;
  if (mixesOperators) {
    return undefined;
  }
  const operator = sourceCode.getFirstTokenBetween(
    expression.left,
    expression.right,
    (token) => token.value === '||',
  );
  return operator === null ? undefined : replacing(operator.range, '??');
}

function ternaryDefault(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
  expression: TSESTree.ConditionalExpression,
): FixPlan | undefined {
  if (
    !SIMPLE_FALLBACKS.has(expression.alternate.type) ||
    hasCommentIn(sourceCode, expression.range)
  ) {
    return undefined;
  }
  const fallback = sourceCode.getText(expression.alternate);
  return replacing(expression.range, `${identifier.name} ?? ${fallback}`);
}

export function nullishDefaultFix(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
): FixPlan | undefined {
  const expression = identifier.parent;
  if (expression.type === AST_NODE_TYPES.LogicalExpression) {
    return expression.left === identifier ? orDefault(sourceCode, expression) : undefined;
  }
  const isTernary =
    expression.type === AST_NODE_TYPES.ConditionalExpression && expression.test === identifier;
  return isTernary ? ternaryDefault(sourceCode, identifier, expression) : undefined;
}
