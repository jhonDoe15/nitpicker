import { readLayout } from '../../head-policy.mjs';

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
        for (let current = node.parent; current; current = current.parent) {
          if (current.type === 'TryStatement' && current.finalizer) {
            let insideBlock = false;
            for (let parent = node.parent; parent && parent !== current; parent = parent.parent) {
              if (parent === current.block) insideBlock = true;
            }
            if (insideBlock) return;
          }
        }
        context.report({ node, messageId: 'unguardedPause' });
      },
    };
  },
};
