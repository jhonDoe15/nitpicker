import { isTestFunctionChain } from '../test-quality/test-calls.mjs';
import { isLiteralCondition } from './literal-condition.mjs';

const CONDITIONAL_SKIPS = new Set(['skipIf', 'runIf']);
const TOKEN_MESSAGES = new Map([['todo', 'todo']]);

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban test forms that switch a test off' },
    schema: [],
    messages: {
      todo: 'Do not leave a `todo` test: write the test, or delete the stub.',
      literalCondition:
        'A literal condition switches the test off for good. Delete the test or make it run; a real platform condition such as `process.platform === "win32"` is allowed.',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.computed || !isTestFunctionChain(node.object)) {
          return;
        }
        const messageId = TOKEN_MESSAGES.get(node.property.name);
        if (messageId !== undefined) {
          context.report({ node: node.property, messageId });
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          CONDITIONAL_SKIPS.has(callee.property.name) &&
          isTestFunctionChain(callee.object) &&
          isLiteralCondition(node.arguments[0])
        ) {
          context.report({ node: callee.property, messageId: 'literalCondition' });
        }
      },
    };
  },
};
