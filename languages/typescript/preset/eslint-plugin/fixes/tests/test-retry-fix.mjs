import { removingProperty } from '../support/objects.mjs';
import { removingStatement } from '../support/ranges.mjs';

function isOptionsOfCall(object) {
  return object.parent.type === 'CallExpression' && object.parent.arguments.includes(object);
}

export function retryFix(sourceCode, retry) {
  const { parent } = retry;
  if (parent.type === 'Property' && parent.value === retry && !parent.computed) {
    const object = parent.parent;
    return object.type === 'ObjectExpression' && isOptionsOfCall(object)
      ? removingProperty(sourceCode, parent)
      : undefined;
  }
  const isOnlyArgument = parent.type === 'CallExpression' && parent.arguments.length === 1;
  if (isOnlyArgument && parent.parent.type === 'ExpressionStatement') {
    return removingStatement(sourceCode, parent.parent);
  }
  return undefined;
}
