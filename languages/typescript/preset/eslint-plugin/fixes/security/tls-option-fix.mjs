import { removingProperty } from '../support/objects.mjs';
import { removingStatement } from '../support/ranges.mjs';

export function tlsOptionFix(sourceCode, node) {
  if (node.type === 'Property') {
    return node.parent.type === 'ObjectExpression' && !node.computed
      ? removingProperty(sourceCode, node)
      : undefined;
  }
  const isStatement =
    node.type === 'AssignmentExpression' && node.parent.type === 'ExpressionStatement';
  return isStatement ? removingStatement(sourceCode, node.parent) : undefined;
}
