import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { calledMember, memberName } from '../../collections/costly-forms/repeated-runs.mts';
import { ASSERTION_WRAPPERS, unwrapOf } from '../../typed/syntax-views.mts';
import type { SourceCode } from '../../typed/node-views.mts';
import { innermostRepeat } from '../support/loop-invariance.mts';

type Group = { readonly target: TSESTree.Node; readonly key: TSESTree.Node };

const FALLBACKS = new Set(['??', '||']);
const WRAPPERS = [...ASSERTION_WRAPPERS, AST_NODE_TYPES.ChainExpression];

function inner(node: TSESTree.Node): TSESTree.Node {
  return unwrapOf(node, WRAPPERS);
}

function storedGroup(node: TSESTree.Node): Group | undefined {
  const read = inner(node);
  if (read.type === AST_NODE_TYPES.MemberExpression && read.computed) {
    return { target: read.object, key: read.property };
  }
  if (read.type !== AST_NODE_TYPES.CallExpression || read.arguments.length !== 1) {
    return undefined;
  }
  const member = calledMember(read);
  const [key] = read.arguments;
  return member !== undefined && memberName(member) === 'get' && key !== undefined
    ? { target: member.object, key }
    : undefined;
}

function readGroup(spread: TSESTree.SpreadElement): Group | undefined {
  const fallback = inner(spread.argument);
  if (
    fallback.type !== AST_NODE_TYPES.LogicalExpression ||
    !FALLBACKS.has(fallback.operator) ||
    fallback.right.type !== AST_NODE_TYPES.ArrayExpression ||
    fallback.right.elements.length > 0
  ) {
    return undefined;
  }
  return storedGroup(fallback.left);
}

function writtenGroup(array: TSESTree.ArrayExpression): Group | undefined {
  const { parent } = array;
  if (parent.type === AST_NODE_TYPES.AssignmentExpression) {
    return parent.operator === '=' && parent.right === array ? storedGroup(parent.left) : undefined;
  }
  if (parent.type !== AST_NODE_TYPES.CallExpression || parent.arguments[1] !== array) {
    return undefined;
  }
  const member = calledMember(parent);
  const [key] = parent.arguments;
  return member !== undefined &&
    memberName(member) === 'set' &&
    parent.arguments.length === 2 &&
    key !== undefined
    ? { target: member.object, key }
    : undefined;
}

function sameGroup(sourceCode: SourceCode, read: Group, written: Group): boolean {
  return (
    sourceCode.getText(inner(read.target)) === sourceCode.getText(inner(written.target)) &&
    sourceCode.getText(inner(read.key)) === sourceCode.getText(inner(written.key))
  );
}

function fixedRepeat(node: TSESTree.Node): boolean {
  const repeat = innermostRepeat(node);
  if (repeat === undefined) {
    return true;
  }
  if (repeat.node.type === AST_NODE_TYPES.ForOfStatement) {
    return repeat.node.right.type === AST_NODE_TYPES.ArrayExpression;
  }
  const call = repeat.kind === 'callback' ? repeat.node.parent : undefined;
  return (
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    inner(call.callee.object).type === AST_NODE_TYPES.ArrayExpression
  );
}

export const rule: TSESLint.RuleModule<'groupCopied'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow copying a whole group of a Map or object into a new array on every step of a loop',
    },
    schema: [],
    messages: {
      groupCopied:
        '`{{target}}` gets a new copy of the whole group of `{{key}}` on every pass of this loop or callback, so a group of n items costs n²/2 element copies. Get the group once and push onto it, and create it with `[value]` when it is missing (`const group = groups.get(key); if (group) group.push(value); else groups.set(key, [value]);`). An exception fits only when every group stays a handful of items.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      SpreadElement(spread) {
        const array = spread.parent;
        if (array.type !== AST_NODE_TYPES.ArrayExpression || array.elements[0] !== spread) {
          return;
        }
        const read = readGroup(spread);
        const written = writtenGroup(array);
        if (
          read !== undefined &&
          written !== undefined &&
          sameGroup(sourceCode, read, written) &&
          !fixedRepeat(array)
        ) {
          context.report({
            node: spread,
            messageId: 'groupCopied',
            data: {
              target: sourceCode.getText(inner(written.target)),
              key: sourceCode.getText(inner(written.key)),
            },
          });
        }
      },
    };
  },
};
