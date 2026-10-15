import { readLayout } from '../../../../head-policy.mjs';
import { ancestorsOf } from '../../analysis/ancestry.mjs';

const { isTestFixture } = readLayout();

function isInsideGuardedTry(node) {
  const ancestors = ancestorsOf(node);
  return ancestors.some(
    (current, index) =>
      current.type === 'TryStatement' &&
      current.finalizer &&
      ancestors.slice(0, index).includes(current.block),
  );
}

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
        if (isInsideGuardedTry(node)) return;
        context.report({ node, messageId: 'unguardedPause' });
      },
    };
  },
};
