import { isTestFunctionChain } from '../test-quality/test-calls.mjs';

const CONDITIONAL_SKIPS = new Set(['skipIf', 'runIf']);
const TOKEN_MESSAGES = new Map([
  ['todo', 'todo'],
  ['fails', 'fails'],
]);

function isBooleanLiteral(node) {
  return node?.type === 'Literal' && typeof node.value === 'boolean';
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban test forms that switch a test off or invert its result' },
    schema: [],
    messages: {
      todo: 'Do not leave a `todo` test: write the test, or delete the stub. A justified exception goes in nitpicker.config.json.',
      fails:
        'Do not use `fails`: the test passes when its assertion fails. Fix the code and assert the correct behaviour. A justified exception goes in nitpicker.config.json.',
      literalCondition:
        'A literal condition switches the test off for good. Delete the test or make it run; a real platform condition such as `process.platform === "win32"` is allowed. A justified exception goes in nitpicker.config.json.',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.computed || !isTestFunctionChain(node.object)) return;
        const messageId = TOKEN_MESSAGES.get(node.property.name);
        if (messageId !== undefined) context.report({ node: node.property, messageId });
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          CONDITIONAL_SKIPS.has(callee.property.name) &&
          isTestFunctionChain(callee.object) &&
          isBooleanLiteral(node.arguments[0])
        ) {
          context.report({ node: callee.property, messageId: 'literalCondition' });
        }
      },
    };
  },
};
