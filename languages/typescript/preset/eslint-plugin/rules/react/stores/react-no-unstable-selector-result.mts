import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isCallback } from '../../typed/syntax-views.mts';
import { freshReturn } from './fresh-values.mts';
import { storeHookOf, type StoreHook } from './store-hooks.mts';

type MessageId = 'reduxSelector' | 'zustandSelector';

const selectorPositions: Readonly<Record<StoreHook, number>> = {
  redux: 0,
  zustand: 0,
  'zustand-store': 1,
};
const messageIds: Readonly<Record<StoreHook, MessageId>> = {
  redux: 'reduxSelector',
  zustand: 'zustandSelector',
  'zustand-store': 'zustandSelector',
};

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow store selectors that return a new object or array on every call',
    },
    schema: [],
    messages: {
      reduxSelector:
        'This `useSelector` selector returns {{what}} on every call, so the component renders again after every dispatched action, whatever it changed. Select each stored value with its own `useSelector` call, move the work into a `createSelector` selector, or pass `shallowEqual` as the second argument. An exception fits only when the component must render on every action.',
      zustandSelector:
        'This store selector returns {{what}} on every call: Zustand 5 throws "Maximum update depth exceeded" and Zustand 4 renders the component on every store change. Select each stored value with its own call or wrap the selector in `useShallow(...)`. An exception fits only when the component must render on every store change.',
    },
  },
  create(context) {
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const selector = node.arguments.at(-1);
        if (node.callee.type !== AST_NODE_TYPES.Identifier || !isCallback(selector)) {
          return;
        }
        const what = freshReturn(selector);
        const hook = what === undefined ? undefined : storeHookOf(context, node.callee);
        if (
          what !== undefined &&
          hook !== undefined &&
          node.arguments.length === selectorPositions[hook] + 1
        ) {
          context.report({ node: selector, messageId: messageIds[hook], data: { what } });
        }
      },
    };
  },
};
