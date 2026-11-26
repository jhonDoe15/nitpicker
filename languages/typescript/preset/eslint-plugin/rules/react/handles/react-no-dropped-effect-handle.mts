import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { typeCheckedRule } from '../../lifecycles/shared/type-checked-rule.mts';
import {
  boundedReceiver,
  isReleaseHandle,
  subscribingName,
} from '../../lifecycles/subscriptions/subscription-handles.mts';
import { isEffectCallback } from '../react-effects.mts';
import { unreleasedCalls } from './dropped-handles.mts';

export const rule = typeCheckedRule({
  description:
    'Require effects to release the unsubscribe function or disposable that a subscription returns',
  messages: {
    dropped:
      'The handle returned by {{name}}(...) is dropped, so the listener stays registered after the component unmounts and every run of the effect adds another one. The effect returns no cleanup: return the handle as the cleanup (`useEffect(() => {{name}}(...), [...])`) or call it in a cleanup the effect returns. An exception fits only when the source dies with the component.',
    unused:
      '`{{handle}}` keeps the handle returned by {{name}}(...) but the effect returns no cleanup and never calls or closes it, so the listener stays registered after the component unmounts and every run of the effect adds another one. Return a cleanup that releases `{{handle}}`. An exception fits only when the source dies with the component.',
  },
  listeners: ({ context, sourceCode, checker, nodeMap }) => ({
    CallExpression(node: TSESTree.CallExpression) {
      const [effect] = node.arguments;
      if (
        effect === undefined ||
        !isEffectCallback(sourceCode, effect) ||
        effect.body.type !== AST_NODE_TYPES.BlockStatement
      ) {
        return;
      }
      for (const { call, kept } of unreleasedCalls(effect.body, sourceCode)) {
        const name = subscribingName(call);
        const registers = name?.startsWith('register') === true;
        const tsNode = nodeMap.get(call);
        if (
          name !== undefined &&
          !registers &&
          !boundedReceiver(sourceCode, call) &&
          isReleaseHandle(checker, checker.getTypeAtLocation(tsNode), tsNode)
        ) {
          const data = { name: sourceCode.getText(call.callee), handle: kept?.name ?? '' };
          context.report({
            node: call,
            messageId: kept === undefined ? 'dropped' : 'unused',
            data,
          });
        }
      }
    },
  }),
});
