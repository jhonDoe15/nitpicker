import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  classEntryGroupsOf,
  directCallsOf,
  moduleEntriesOf,
  type Entry,
  type EntryKind,
} from './call-graph.mts';
import { unguardedSiblingsOf } from './cycle-analysis.mts';
import { guardsOf } from './reentry-guards.mts';

type MessageId = 'unguardedRecursionSibling';

function checkGroup(
  context: TSESLint.RuleContext<MessageId, []>,
  entries: readonly Entry[],
  kind: EntryKind,
): void {
  if (entries.length < 3) {
    return;
  }
  const calls = directCallsOf(entries, kind);
  const guards = guardsOf(entries, kind);
  for (const finding of unguardedSiblingsOf(entries, calls, guards)) {
    context.report({
      node: finding.entry.node,
      messageId: 'unguardedRecursionSibling',
      data: {
        name: finding.entry.name,
        sibling: finding.sibling,
        guard: finding.guard,
      },
    });
  }
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a mutual-recursion entry point that omits the re-entry guard used by a sibling entry point',
    },
    schema: [],
    messages: {
      unguardedRecursionSibling:
        '`{{ name }}` enters the same recursion cycle as `{{ sibling }}` without checking and updating `{{ guard }}`. Apply the same `{{ guard }}` re-entry guard or delegate through `{{ sibling }}`.',
    },
  },
  create(context) {
    return {
      Program(node: TSESTree.Program) {
        checkGroup(context, moduleEntriesOf(node), 'module');
      },
      ClassBody(node: TSESTree.ClassBody) {
        for (const group of classEntryGroupsOf(node)) {
          checkGroup(context, group, 'class');
        }
      },
    };
  },
};
