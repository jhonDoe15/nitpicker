import { hasCommentIn, replacing } from '../support/ranges.mjs';
import { isDeclared } from '../support/scope.mjs';

export function teardownFix(sourceCode, call, member) {
  const isOptional = call.optional || member.optional || call.parent.type === 'ChainExpression';
  if (call.arguments.length > 0 || isOptional || call.callee.type === 'ChainExpression') {
    return undefined;
  }
  if (!isDeclared(sourceCode, call, 'teardownContainer') || hasCommentIn(sourceCode, call.range)) {
    return undefined;
  }
  return replacing(call.range, `teardownContainer(${sourceCode.getText(member.object)})`);
}
