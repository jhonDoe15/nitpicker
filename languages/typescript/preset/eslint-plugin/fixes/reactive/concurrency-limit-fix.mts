import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { appendingArgument } from '../support/calls.mts';
import { hasCommentIn, replacing, type FixPlan } from '../support/ranges.mts';

type Call = TSESTree.CallExpression;

export type LimitSite = {
  readonly operator: string;
  readonly isUnlimited: (argument: TSESTree.Node) => boolean;
  readonly isSelector: (argument: TSESTree.Node) => boolean;
};

export const CONCURRENCY_LIMIT = 8;

const LIMITED = new Set(['mergeMap', 'flatMap', 'mergeAll', 'merge']);
const LIMIT_TEXT = String(CONCURRENCY_LIMIT);

function commentOutsideArguments(sourceCode: SourceCode, call: Call): boolean {
  const inside = (index: number) =>
    call.arguments.some((argument) => argument.range[0] <= index && index < argument.range[1]);
  return sourceCode
    .getAllComments()
    .some(
      (comment) =>
        comment.range[0] >= call.callee.range[1] &&
        comment.range[1] <= call.range[1] &&
        !inside(comment.range[0]),
    );
}

function replacingLimit(
  sourceCode: SourceCode,
  limit: TSESTree.CallExpressionArgument | undefined,
  site: LimitSite,
): FixPlan | undefined {
  if (limit === undefined || site.isSelector(limit) || !site.isUnlimited(limit)) {
    return undefined;
  }
  return hasCommentIn(sourceCode, limit.range) ? undefined : replacing(limit.range, LIMIT_TEXT);
}

function mergeMapFix(sourceCode: SourceCode, call: Call, site: LimitSite): FixPlan | undefined {
  switch (call.arguments.length) {
    case 1:
      return appendingArgument(sourceCode, call, LIMIT_TEXT);
    case 2:
      return replacingLimit(sourceCode, call.arguments[1], site);
    default:
      return undefined;
  }
}

function operatorFix(sourceCode: SourceCode, call: Call, site: LimitSite): FixPlan | undefined {
  if (site.operator === 'mergeAll') {
    return call.arguments.length === 0
      ? appendingArgument(sourceCode, call, LIMIT_TEXT)
      : replacingLimit(sourceCode, call.arguments[0], site);
  }
  if (site.operator === 'merge') {
    return call.arguments.at(-1)?.type === AST_NODE_TYPES.SpreadElement
      ? appendingArgument(sourceCode, call, LIMIT_TEXT)
      : undefined;
  }
  return mergeMapFix(sourceCode, call, site);
}

export function concurrencyLimitFix(
  sourceCode: SourceCode,
  call: Call,
  site: LimitSite,
): FixPlan | undefined {
  const spread = call.arguments.some((argument) => argument.type === AST_NODE_TYPES.SpreadElement);
  const allowed = LIMITED.has(site.operator) && (site.operator === 'merge' || !spread);
  return allowed && !commentOutsideArguments(sourceCode, call)
    ? operatorFix(sourceCode, call, site)
    : undefined;
}
