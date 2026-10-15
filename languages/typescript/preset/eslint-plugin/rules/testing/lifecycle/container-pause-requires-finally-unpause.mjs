import { readLayout } from '../../../../head-policy.mjs';
import { ancestorsOf } from '../../analysis/ancestry.mjs';

const { isTestFixture } = readLayout();

export const rule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      unguardedPause:
        'Pause a container inside a try block with a finally unpause, or use withPausedContainer.',
    },
  },
  create(context) {
    if (isTestFixture(context.filename, 'container-teardown.ts')) return {};
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          node.arguments.length !== 0 ||
          callee.type !== 'MemberExpression' ||
          callee.computed ||
          callee.property.name !== 'pause'
        )
          return;
        const ancestors = ancestorsOf(node);
        for (const current of ancestors) {
          if (current.type === 'TryStatement' && current.finalizer) {
            const insideBlock = ancestors
              .slice(0, ancestors.indexOf(current))
              .includes(current.block);
            if (insideBlock) return;
          }
        }
        context.report({ node, messageId: 'unguardedPause' });
      },
    };
  },
};
