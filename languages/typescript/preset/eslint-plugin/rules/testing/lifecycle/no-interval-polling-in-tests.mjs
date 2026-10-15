import { readLayout } from '../../../../head-policy.mjs';
import { pollAdvice } from '../../test-runner/runner-advice.mjs';

const { isTestFixture } = readLayout();

export const rule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      intervalPolling: 'Prefer {{advice}} over setInterval polling in tests.',
    },
  },
  create(context) {
    if (isTestFixture(context.filename)) return {};
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          (callee.type === 'Identifier' && callee.name === 'setInterval') ||
          (callee.type === 'MemberExpression' &&
            !callee.computed &&
            callee.object.type === 'Identifier' &&
            callee.object.name === 'globalThis' &&
            callee.property.name === 'setInterval')
        )
          context.report({
            node,
            messageId: 'intervalPolling',
            data: { advice: pollAdvice(context) },
          });
      },
    };
  },
};
