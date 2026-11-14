import { hasCommentIn, replacing } from '../support/ranges.mjs';

const SIMPLE_FALLBACKS = new Set([
  'Literal',
  'Identifier',
  'MemberExpression',
  'CallExpression',
  'NewExpression',
  'TemplateLiteral',
  'ArrayExpression',
  'ObjectExpression',
]);

function orDefault(sourceCode, expression) {
  const mixesOperators =
    expression.right.type === 'LogicalExpression' || expression.parent.type === 'LogicalExpression';
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

function ternaryDefault(sourceCode, identifier, expression) {
  if (
    !SIMPLE_FALLBACKS.has(expression.alternate.type) ||
    hasCommentIn(sourceCode, expression.range)
  ) {
    return undefined;
  }
  const fallback = sourceCode.getText(expression.alternate);
  return replacing(expression.range, `${identifier.name} ?? ${fallback}`);
}

export function nullishDefaultFix(sourceCode, identifier) {
  const expression = identifier.parent;
  if (expression.type === 'LogicalExpression') {
    return expression.left === identifier ? orDefault(sourceCode, expression) : undefined;
  }
  const isTernary = expression.type === 'ConditionalExpression' && expression.test === identifier;
  return isTernary ? ternaryDefault(sourceCode, identifier, expression) : undefined;
}
