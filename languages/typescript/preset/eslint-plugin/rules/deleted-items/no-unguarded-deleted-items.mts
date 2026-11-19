import {
  typedProgramRule,
  type ProgramFinding,
  type ProgramScope,
} from '../program-rules/typed-program-rule.mts';
import { followedFlag, isIntended, iterationsOf, type Followed } from './project-index.mts';
import type { Iteration } from './iterations.mts';

const MESSAGE = [
  'This `{{kind}}` over `{{type}}` does not skip the items that `{{flag}}` marks, which {{share}}% of the',
  'iterations over that type in this project do, so deleted items can reach the result.',
  'Skip them with {{allowed}}.',
  'An exception fits undo, trash, restore and sync code that reads flagged items on purpose.',
].join(' ');

function allowedForms(followed: Followed): string {
  const forms = [`a guard on \`${followed.name}\``];
  if (followed.helper !== undefined) {
    forms.push(`the helper \`${followed.helper}\``);
  }
  if (followed.alias !== undefined) {
    forms.push(`the type \`${followed.alias}\``);
  }
  return forms.join(', ');
}

function findingOf(iteration: Iteration, scope: ProgramScope): ProgramFinding | undefined {
  const skipped = iteration.guarded || isIntended(scope.program, iteration.node);
  const followed = skipped ? undefined : followedFlag(scope.program, iteration.flag.key);
  return followed === undefined
    ? undefined
    : {
        node: iteration.node,
        data: {
          kind: iteration.kind,
          type: iteration.type,
          flag: followed.name,
          share: String(followed.share),
          allowed: allowedForms(followed),
        },
      };
}

export const rule = typedProgramRule({
  description:
    "Skip the items the project's deleted or visibility flag marks when iterating a collection",
  messageId: 'unguarded',
  messages: { unguarded: MESSAGE },
  findings: (scope) =>
    iterationsOf(scope.sourceFile, scope.checker)
      .map((iteration) => findingOf(iteration, scope))
      .filter((finding) => finding !== undefined),
});
