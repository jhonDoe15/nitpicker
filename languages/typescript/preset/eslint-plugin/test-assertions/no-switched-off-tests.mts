import { AST_NODE_TYPES, type TSESLint } from '@typescript-eslint/utils';
import { nameOf } from '../rules/typed/node-views.mts';
import { isTestFunctionChain } from '../test-quality/test-calls.mts';
import { isLiteralCondition } from './literal-condition.mts';

const CONDITIONAL_SKIPS = new Set(['skipIf', 'runIf']);
const TOKEN_MESSAGES = new Map<string, 'todo'>([['todo', 'todo']]);

export const rule: TSESLint.RuleModule<'todo' | 'literalCondition'> = {
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
        const messageId = TOKEN_MESSAGES.get(nameOf(node.property) ?? '');
        if (messageId !== undefined) {
          context.report({ node: node.property, messageId });
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          !callee.computed &&
          CONDITIONAL_SKIPS.has(nameOf(callee.property) ?? '') &&
          isTestFunctionChain(callee.object) &&
          isLiteralCondition(node.arguments[0])
        ) {
          context.report({ node: callee.property, messageId: 'literalCondition' });
        }
      },
    };
  },
};
