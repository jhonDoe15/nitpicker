import { AST_NODE_TYPES, type TSESLint } from '@typescript-eslint/utils';
import { readLayout } from '../../typed/policy-views.mts';
import { RUNNER_OPTION_SCHEMA, vocabularyOf } from '../../runner-apis/runner-option.mts';

const { isTestFixture } = readLayout();

export const rule: TSESLint.RuleModule<'intervalPolling'> = {
  meta: {
    type: 'problem',
    schema: RUNNER_OPTION_SCHEMA,
    messages: {
      intervalPolling: 'Prefer {{pollInstead}} over setInterval polling in tests.',
    },
  },
  create(context) {
    if (isTestFixture(context.filename)) {
      return {};
    }
    const { pollInstead } = vocabularyOf(context);
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
          context.report({ node, messageId: 'intervalPolling', data: { pollInstead } });
        }
      },
    };
  },
};
