import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isInsideTry } from '../parsing/handled-contexts.mts';
import { isNamedMember } from '../typed/syntax-views.mts';
import { batchFunction, isIndependentInputs } from './batch-inputs.mts';
import { unhandledFailingCall } from './failing-operations.mts';

function isCollected(node: TSESTree.CallExpression): boolean {
  const awaited = node.parent.type === AST_NODE_TYPES.AwaitExpression ? node.parent : node;
  const { parent } = awaited;
  return (
    parent.type === AST_NODE_TYPES.ReturnStatement ||
    parent.type === AST_NODE_TYPES.VariableDeclarator ||
    parent.type === AST_NODE_TYPES.AssignmentExpression ||
    (parent.type === AST_NODE_TYPES.ArrowFunctionExpression && parent.body === awaited)
  );
}

function isMapCall(
  node: TSESTree.Node | undefined,
): node is TSESTree.CallExpression & { callee: TSESTree.MemberExpression } {
  return (
    node?.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.callee.property.name === 'map' &&
    node.arguments.length === 1
  );
}

export const rule: TSESLint.RuleModule<'allOrNothing'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Promise.all over file inputs whose callback can fail per input',
    },
    schema: [],
    messages: {
      allOrNothing:
        'One input that fails here rejects the whole `Promise.all` and discards the results of every other input. Decide per input: catch the failure inside the callback and return a skipped-input entry or an error result, then fail at the end if the caller needs that, or use `Promise.allSettled`.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const [mapped] = node.arguments;
        if (
          !isNamedMember(node.callee, 'Promise', 'all') ||
          !isMapCall(mapped) ||
          !isCollected(node) ||
          isInsideTry(node) ||
          !isIndependentInputs(context, mapped.callee.object)
        ) {
          return;
        }
        const callback = batchFunction(context, mapped.arguments[0]);
        if (callback !== undefined && unhandledFailingCall(callback) !== undefined) {
          context.report({ node, messageId: 'allOrNothing' });
        }
      },
    };
  },
};
