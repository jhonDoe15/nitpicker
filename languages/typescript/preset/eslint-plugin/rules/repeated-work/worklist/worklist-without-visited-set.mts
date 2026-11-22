import type { TSESLint } from '@typescript-eslint/utils';
import { isTestFile } from '../materialize/unbounded-source.mts';
import { hasVisitedCheck, isSyntaxTreeWorklist } from './worklist-guards.mts';
import {
  canAppendMultiple,
  extractWorklistLoop,
  type WorklistLoopNode,
} from './worklist-loops.mts';

export const rule: TSESLint.RuleModule<'worklistWithoutVisitedSet'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow multi-fan-out worklist loops that append items without checking a visited set',
    },
    schema: [],
    messages: {
      worklistWithoutVisitedSet:
        'This worklist loop appends multiple items per iteration without checking a visited set. Even with a depth-only bound, a multi-fan-out worklist expands shared nodes exponentially in a DAG or cyclic graph. Track visited items in a Set before expanding or enqueuing them.',
    },
  },
  create(context) {
    if (isTestFile(context.filename)) {
      return {};
    }
    const { sourceCode } = context;
    function check(loop: WorklistLoopNode): void {
      const worklist = extractWorklistLoop(loop);
      if (
        worklist !== undefined &&
        canAppendMultiple(worklist) &&
        !hasVisitedCheck(worklist) &&
        !isSyntaxTreeWorklist(worklist, sourceCode)
      ) {
        context.report({ node: loop, messageId: 'worklistWithoutVisitedSet' });
      }
    }
    return {
      ForOfStatement: check,
      WhileStatement: check,
    };
  },
};
