import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { readLayout } from '../../typed/policy-views.mts';
import { ancestorsOf } from '../../typed/node-views.mts';
import { pauseFix } from '../../../fixes/processes/container-pause-fix.mts';
import { fixable } from '../../../fixes/support/descriptors.mts';

const { isTestFixture } = readLayout();

function isInsideGuardedTry(node: TSESTree.Node): boolean {
  const ancestors = ancestorsOf(node);
  return ancestors.some(
    (current, index) =>
      current.type === AST_NODE_TYPES.TryStatement &&
      current.finalizer !== null &&
      ancestors.slice(0, index).includes(current.block),
  );
}

export const rule: TSESLint.RuleModule<'unguardedPause'> = {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: {
      unguardedPause:
        'Pause a container inside a try block with a finally unpause, or use withPausedContainer.',
    },
  },
  create(context) {
    if (isTestFixture(context.filename, 'container-teardown.ts')) {
      return {};
    }
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          node.arguments.length !== 0 ||
          callee.type !== AST_NODE_TYPES.MemberExpression ||
          callee.computed ||
          callee.property.name !== 'pause'
        ) {
          return;
        }
        if (isInsideGuardedTry(node)) {
          return;
        }
        context.report(
          fixable({ node, messageId: 'unguardedPause' }, pauseFix(context.sourceCode, node)),
        );
      },
    };
  },
};
