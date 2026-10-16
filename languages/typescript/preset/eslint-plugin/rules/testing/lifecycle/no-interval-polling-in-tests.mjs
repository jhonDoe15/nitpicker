import { readLayout } from '../../../../head-policy.mjs';
import { RUNNER_OPTION_SCHEMA, vocabularyOf } from '../runners/runner-option.mjs';

const { isTestFixture } = readLayout();

export const rule = {
  meta: {
    type: 'problem',
    schema: RUNNER_OPTION_SCHEMA,
    messages: {
      intervalPolling: 'Prefer {{pollInstead}} over setInterval polling in tests.',
    },
  },
  create(context) {
    if (isTestFixture(context.filename)) return {};
    const { pollInstead } = vocabularyOf(context);
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
          context.report({ node, messageId: 'intervalPolling', data: { pollInstead } });
      },
    };
  },
};
