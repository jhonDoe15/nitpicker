import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { memberName, unwrapped, type Context } from '../security/security-values.mts';
import { hasByteName, hasTextLength, isText, leaves } from './string-lengths.mts';

type MessageId = 'countBytes';

const COUNT_BYTES: MessageId = 'countBytes';

const COMPARISONS = new Set(['<', '>', '<=', '>=', '===', '!==', '==', '!=']);
const SLICES = new Set(['slice', 'substring', 'substr']);

function comparesLengthToBytes(context: Context, node: TSESTree.BinaryExpression): boolean {
  return (
    COMPARISONS.has(node.operator) &&
    ((hasTextLength(context, node.left) && hasByteName(node.right)) ||
      (hasTextLength(context, node.right) && hasByteName(node.left)))
  );
}

function stepsByBytes(context: Context, node: TSESTree.ForStatement): boolean {
  const { test, update } = node;
  return (
    update?.type === AST_NODE_TYPES.AssignmentExpression &&
    update.operator === '+=' &&
    hasByteName(update.right) &&
    test?.type === AST_NODE_TYPES.BinaryExpression &&
    COMPARISONS.has(test.operator) &&
    (hasTextLength(context, test.left) || hasTextLength(context, test.right))
  );
}

function slicesByBytes(context: Context, node: TSESTree.CallExpression): boolean {
  const callee = unwrapped(node.callee);
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    SLICES.has(memberName(callee) ?? '') &&
    isText(context, callee.object) &&
    node.arguments.some(
      (argument) =>
        argument.type !== AST_NODE_TYPES.SpreadElement &&
        leaves(argument).some((leaf) => hasByteName(leaf)),
    )
  );
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow comparing or stepping string length against a limit named in bytes',
    },
    schema: [],
    messages: {
      countBytes:
        '`string.length` counts UTF-16 code units, not bytes, so non-ASCII text passes this byte limit or a ' +
        'chunk splits a multi-byte character. Measure with `Buffer.byteLength(text, "utf8")` and slice the ' +
        'encoded bytes instead of the string.',
    },
  },
  create(context) {
    return {
      BinaryExpression(node) {
        if (comparesLengthToBytes(context, node)) {
          context.report({ node, messageId: COUNT_BYTES });
        }
      },
      ForStatement(node) {
        if (stepsByBytes(context, node)) {
          context.report({ node, messageId: COUNT_BYTES });
        }
      },
      CallExpression(node) {
        if (slicesByBytes(context, node)) {
          context.report({ node, messageId: COUNT_BYTES });
        }
      },
    };
  },
};
