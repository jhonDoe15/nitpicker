import { removingLastArgument } from '../support/calls.mjs';
import { removingProperty } from '../support/objects.mjs';

export function raisedTimeoutFix(sourceCode, timeout) {
  const { parent } = timeout;
  if (parent.type === 'Property' && parent.value === timeout && !parent.computed) {
    const options = parent.parent;
    const isInline =
      options.type === 'ObjectExpression' &&
      options.parent.type === 'CallExpression' &&
      options.parent.arguments.includes(options);
    return isInline ? removingProperty(sourceCode, parent) : undefined;
  }
  const isArgument = parent.type === 'CallExpression' && parent.arguments.indexOf(timeout) > 0;
  return isArgument ? removingLastArgument(sourceCode, parent, timeout) : undefined;
}
