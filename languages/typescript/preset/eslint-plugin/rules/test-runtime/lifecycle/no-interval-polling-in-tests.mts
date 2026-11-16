import { AST_NODE_TYPES, type TSESLint } from '@typescript-eslint/utils';
import { readLayout } from '../../typed/policy-views.mts';

const { isTestFixture } = readLayout();

export const rule: TSESLint.RuleModule<'intervalPolling'> = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      intervalPolling: 'Prefer vi.waitFor / expect.poll over setInterval polling in tests.',
    },
  },
  create(context) {
    if (isTestFixture(context.filename)) {
      return {};
    }
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          (callee.type === AST_NODE_TYPES.Identifier && callee.name === 'setInterval') ||
          (callee.type === AST_NODE_TYPES.MemberExpression &&
            !callee.computed &&
            callee.object.type === AST_NODE_TYPES.Identifier &&
            callee.object.name === 'globalThis' &&
            callee.property.name === 'setInterval')
        ) {
          context.report({ node, messageId: 'intervalPolling' });
        }
      },
    };
  },
};
