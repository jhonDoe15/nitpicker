import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { typeCheckedRule } from '../../lifecycles/shared/type-checked-rule.mts';
import { isEffectCallback, nodesOutsideNestedFunctions } from '../react-effects.mts';
import {
  isCandidateEffectCall,
  isEffectReleaseType,
  isSubscribingName,
} from './effect-handles.mts';

const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$|[\\/](__tests__|tests?|e2e)[\\/])/u;

export const rule = typeCheckedRule({
  description:
    'Disallow dropping or failing to release a subscription or disposable handle returned inside a React effect',
  messages: {
    dropped:
      'The handle returned by `{{name}}(...)` is not released by this effect: the subscription stays active after the component unmounts and stacks up on every re-run. Return the unsubscribe function from the effect (`return {{name}}(...)`) or return a cleanup that calls `unsubscribe()` / `dispose()` / `close()` / `disconnect()`. An exception fits only when the subscription is one-shot or outlives the component.',
  },
  listeners: ({ context, sourceCode, checker, nodeMap }) => {
    if (TEST_FILE.test(context.filename)) {
      return {};
    }
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const [effect] = node.arguments;
        if (
          effect === undefined ||
          !isEffectCallback(sourceCode, effect) ||
          effect.body.type !== AST_NODE_TYPES.BlockStatement
        ) {
          return;
        }
        for (const inner of nodesOutsideNestedFunctions(effect.body)) {
          if (
            inner.type !== AST_NODE_TYPES.CallExpression ||
            !isCandidateEffectCall(sourceCode, inner)
          ) {
            continue;
          }
          const tsNode = nodeMap.get(inner);
          if (isEffectReleaseType(checker, tsNode, isSubscribingName(inner))) {
            context.report({
              node: inner,
              messageId: 'dropped',
              data: { name: sourceCode.getText(inner.callee) },
            });
          }
        }
      },
    };
  },
});
