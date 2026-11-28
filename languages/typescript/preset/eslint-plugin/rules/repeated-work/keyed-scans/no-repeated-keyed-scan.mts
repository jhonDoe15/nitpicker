import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  calledMember,
  memberName,
  someNode,
} from '../../collections/costly-forms/repeated-runs.mts';
import { isFunction } from '../../typed/syntax-views.mts';
import { openRepeat } from '../support/loop-invariance.mts';
import { isRepeatingKey, keyedRead, readsLoopState } from './keyed-reads.mts';
import { changedInside, runsOncePerKey } from './key-loops.mts';

function namesIn(node: TSESTree.Node): TSESTree.Node[] {
  const names: TSESTree.Node[] = [];
  someNode(node, (child) => {
    if (child.type === AST_NODE_TYPES.Identifier) {
      names.push(child);
    }
    return false;
  });
  return names;
}

const SCANS = new Set(['every', 'filter', 'find', 'findIndex', 'findLast', 'some']);

export const rule: TSESLint.RuleModule<'scanPerKey'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow repeating the same scan of a collection looked up by key for every element sharing the key',
    },
    schema: [],
    messages: {
      scanPerKey:
        '`{{scan}}` scans the collection of `{{key}}` with a test that reads nothing of the current element, so every element with the same key repeats the same scan. Work the answer out once per key (before the loop, or kept in a `Map` by key) and read it here.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      CallExpression(call) {
        const member = calledMember(call);
        const [predicate] = call.arguments;
        const repeat = openRepeat(call);
        if (
          member === undefined ||
          !SCANS.has(memberName(member) ?? '') ||
          predicate === undefined ||
          !isFunction(predicate) ||
          repeat === undefined
        ) {
          return;
        }
        const read = keyedRead(sourceCode, member.object);
        if (
          read !== undefined &&
          isRepeatingKey(sourceCode, read, repeat.node) &&
          !runsOncePerKey(sourceCode, repeat, read.map) &&
          !changedInside(sourceCode, repeat.node, [
            read.map,
            member.object,
            ...namesIn(predicate),
          ]) &&
          !readsLoopState(sourceCode, predicate, repeat.node)
        ) {
          context.report({
            node: call,
            messageId: 'scanPerKey',
            data: {
              scan: sourceCode.getText(call.callee),
              key: sourceCode.getText(read.key),
            },
          });
        }
      },
    };
  },
};
