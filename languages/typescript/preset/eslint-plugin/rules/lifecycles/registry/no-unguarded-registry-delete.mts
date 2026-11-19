import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../scope/close-scopes.mts';
import { calleeProperty, nearestFunction } from '../shared/scopes.mts';
import { comparesEntry, laterRegistration } from './registry-entries.mts';

export const rule: TSESLint.RuleModule<'unguarded'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a teardown that deletes a registry entry by key to check that the entry is still its own registration',
    },
    schema: [],
    messages: {
      unguarded:
        '{{map}}.delete({{key}}) runs later, in a teardown of the call that did {{map}}.set({{key}}, {{value}}), without checking that the entry is still {{value}}. If a newer registration took the same key in between, this teardown removes it. Check first: `if ({{map}}.get({{key}}) === {{value}}) { {{map}}.delete({{key}}); }`. An exception fits only when the key can never be registered twice.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      CallExpression(call: TSESTree.CallExpression) {
        const { callee } = call;
        if (
          callee.type !== AST_NODE_TYPES.MemberExpression ||
          calleeProperty(call) !== 'delete' ||
          call.arguments.length !== 1
        ) {
          return;
        }
        const teardown = nearestFunction(call);
        if (teardown === undefined || !isFunctionNode(teardown)) {
          return;
        }
        const registration = laterRegistration(sourceCode, call, teardown);
        if (registration === undefined || comparesEntry(sourceCode, teardown, registration)) {
          return;
        }
        context.report({
          node: call,
          messageId: 'unguarded',
          data: {
            map: registration.map,
            key: registration.key,
            value: registration.value,
          },
        });
      },
    };
  },
};
