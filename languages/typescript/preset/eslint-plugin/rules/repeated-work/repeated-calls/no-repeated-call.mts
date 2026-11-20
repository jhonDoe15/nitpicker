import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import type { FunctionNode } from '../../typed/syntax-views.mts';
import { repeatedRecursion } from './repeated-recursion.mts';
import { testedThenUsed } from './tested-then-used.mts';

type MessageId = 'repeatedCall' | 'repeatedRecursion';

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow calling the same function with the same arguments to test a result and again to use it, and recursion that repeats a sub-result',
    },
    schema: [],
    messages: {
      repeatedCall:
        '`{{call}}` runs twice: once to test the result and once more to use it, with nothing in between that could change the answer. Keep the first result in a local and use that (`const found = {{call}}; if (found !== undefined) ...`).',
      repeatedRecursion:
        '`{{call}}` is called twice with the same arguments in one run of `{{name}}`, so every level of the recursion doubles the work and the cost grows exponentially with depth. Call it once and keep the result, or remember the answers per argument in a `Map`.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    function checkUse(node: TSESTree.Node): void {
      const pair = testedThenUsed(sourceCode, node);
      if (pair !== undefined) {
        context.report({
          node: pair.second,
          messageId: 'repeatedCall',
          data: { call: sourceCode.getText(pair.second) },
        });
      }
    }
    function checkRecursion(fn: FunctionNode): void {
      const pair = repeatedRecursion(sourceCode, fn);
      if (pair !== undefined) {
        context.report({
          node: pair.second,
          messageId: 'repeatedRecursion',
          data: {
            call: sourceCode.getText(pair.second),
            name: sourceCode.getText(pair.second.callee),
          },
        });
      }
    }
    return {
      LogicalExpression: checkUse,
      ConditionalExpression: checkUse,
      IfStatement: checkUse,
      FunctionDeclaration: checkRecursion,
      FunctionExpression: checkRecursion,
      ArrowFunctionExpression: checkRecursion,
    };
  },
};
