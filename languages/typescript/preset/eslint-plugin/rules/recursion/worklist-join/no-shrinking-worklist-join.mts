import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { calledHelpersOf, helperReadContainersOf, localFunctionsFor } from './local-helpers.mts';
import { findMonotoneJoinedState } from './monotone-join.mts';
import { hasShrinkingTransfer } from './shrinking-transfer.mts';
import { analyzeWorklistLoop } from './worklist-loop.mts';

type MessageId = 'shrinkingWorklistJoin';

function allStateContainers(
  direct: ReadonlySet<string>,
  fromHelpers: ReadonlySet<string>,
  auxSets: ReadonlySet<string>,
): Set<string> {
  const combined = new Set<string>(direct);
  for (const name of fromHelpers) {
    if (!auxSets.has(name)) {
      combined.add(name);
    }
  }
  return combined;
}

function checkLoop(
  context: TSESLint.RuleContext<MessageId, []>,
  node: TSESTree.WhileStatement,
): void {
  const info = analyzeWorklistLoop(node);
  if (info === undefined) {
    return;
  }
  const localFns = localFunctionsFor(node);
  const helperContainers = helperReadContainersOf(info.nodes, info.nodeVar, localFns);
  const containers = allStateContainers(info.stateContainers, helperContainers, info.auxSets);
  const joinMatch = findMonotoneJoinedState(info, containers);
  if (joinMatch === undefined) {
    return;
  }
  const helpers = calledHelpersOf(info.nodes, localFns);
  if (!hasShrinkingTransfer(info, joinMatch, helpers)) {
    return;
  }
  context.report({
    node,
    messageId: 'shrinkingWorklistJoin',
    data: { state: joinMatch.state },
  });
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a work-list pass that joins monotonically into stored successor state when its transfer can shrink or overwrite earlier contributions',
    },
    schema: [],
    messages: {
      shrinkingWorklistJoin:
        "Joining directly into the successor's stored state `{{ state }}` keeps what an earlier pass sent even after a contribution shrinks. Store the last output per edge and recompute the successor's input from all incoming edges instead.",
    },
  },
  create(context) {
    return {
      WhileStatement(node: TSESTree.WhileStatement) {
        checkLoop(context, node);
      },
    };
  },
};
