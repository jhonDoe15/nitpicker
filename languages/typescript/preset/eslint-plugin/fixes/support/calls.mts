import type { TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { hasCommentIn, inserting, replacing, type FixPlan } from './ranges.mts';

type CallLike = TSESTree.CallExpression | TSESTree.NewExpression;

export function appendingArgument(
  sourceCode: SourceCode,
  call: CallLike,
  text: string,
): FixPlan | undefined {
  const last = call.arguments.at(-1);
  if (last !== undefined) {
    return inserting(last.range[1], `, ${text}`);
  }
  const closing = sourceCode.getLastToken(call);
  return closing === null ? undefined : inserting(closing.range[0], text);
}

export function removingLastArgument(
  sourceCode: SourceCode,
  call: CallLike,
  argument: TSESTree.Node,
): FixPlan | undefined {
  if (call.arguments.at(-1) !== argument) {
    return undefined;
  }
  const previous = call.arguments[call.arguments.findIndex((each) => each === argument) - 1];
  const range: TSESTree.Range = [
    previous === undefined ? argument.range[0] : previous.range[1],
    argument.range[1],
  ];
  return hasCommentIn(sourceCode, range) ? undefined : replacing(range, '');
}
