import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { calledMember, memberName } from '../../collections/costly-forms/repeated-runs.mts';
import type { SourceCode } from '../../typed/node-views.mts';
import { calleeNameOf, isFunction, unwrapped } from '../../typed/syntax-views.mts';
import { filteredOneSide } from './filtered-lists.mts';
import { isPlainPath } from '../support/plain-paths.mts';
import { countedLoop, indexedLists } from './positional-reads.mts';

type Pairing = { readonly node: TSESTree.Node; readonly filtered: TSESTree.Node };

const PAIRING_STEPS = new Set(['every', 'flatMap', 'forEach', 'map', 'some']);

function callbackPairing(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): Pairing | undefined {
  const member = calledMember(call);
  const [callback] = call.arguments;
  if (
    member === undefined ||
    !PAIRING_STEPS.has(memberName(member) ?? '') ||
    callback === undefined ||
    !isFunction(callback)
  ) {
    return undefined;
  }
  const index = callback.params[1];
  if (index?.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const receiver = unwrapped(member.object);
  for (const other of indexedLists(sourceCode, index.name, callback)) {
    const filtered = filteredOneSide(sourceCode, receiver, other);
    if (filtered !== undefined && sourceCode.getText(other) !== sourceCode.getText(receiver)) {
      return { node: call, filtered };
    }
  }
  return undefined;
}

function zipPairing(sourceCode: SourceCode, call: TSESTree.CallExpression): Pairing | undefined {
  const [first, second] = call.arguments;
  if (calleeNameOf(call.callee) !== 'zip' || first === undefined || second === undefined) {
    return undefined;
  }
  const filtered = filteredOneSide(sourceCode, first, second);
  return filtered === undefined ? undefined : { node: call, filtered };
}

function loopPairing(sourceCode: SourceCode, loop: TSESTree.ForStatement): Pairing | undefined {
  const counted = countedLoop(loop);
  if (counted === undefined || !isPlainPath(counted.bound)) {
    return undefined;
  }
  const lists = indexedLists(sourceCode, counted.index, loop);
  const filtered = lists
    .flatMap((first, position) => lists.slice(position + 1).map((second) => [first, second]))
    .map(([first, second]) =>
      first === undefined || second === undefined
        ? undefined
        : filteredOneSide(sourceCode, first, second),
    )
    .find((side) => side !== undefined);
  return filtered === undefined ? undefined : { node: loop, filtered };
}

export const rule: TSESLint.RuleModule<'filteredPairing'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow pairing a filtered list by position with a list that was not filtered the same way',
    },
    schema: [],
    messages: {
      filteredPairing:
        '`{{filtered}}` is filtered before it is paired by position with another list that was not filtered the same way, so after the first dropped entry the positions no longer line up. Pair first and filter the pairs, or keep a placeholder for the dropped entries.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    function report(pairing: Pairing | undefined): void {
      if (pairing !== undefined) {
        context.report({
          node: pairing.node,
          messageId: 'filteredPairing',
          data: { filtered: sourceCode.getText(pairing.filtered) },
        });
      }
    }
    return {
      CallExpression(call) {
        report(callbackPairing(sourceCode, call) ?? zipPairing(sourceCode, call));
      },
      ForStatement(loop) {
        report(loopPairing(sourceCode, loop));
      },
    };
  },
};
