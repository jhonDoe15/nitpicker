import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveFunction, type SourceContext } from '../analysis/constant-resolution.mts';
import { isFunction, type FunctionNode } from '../typed/syntax-views.mts';
import { nameOf } from '../typed/node-views.mts';
import {
  branchesOf,
  comparatorOf,
  isNonZeroNumber,
  outcomesOf,
  returnedValues,
  sortsUniqueItems,
  type Comparator,
} from './comparator-outcomes.mts';
import {
  isSideIndependent,
  testsMissingBothSides,
  testsPresentBothSides,
} from './missing-checks.mts';

const SORT_METHODS = new Set(['sort', 'toSorted']);
const MIN_OUTCOMES = 2;

function sortedWith(
  context: SourceContext,
  node: TSESTree.CallExpression,
): FunctionNode | undefined {
  const { callee, arguments: args } = node;
  const [argument] = args;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    !SORT_METHODS.has(nameOf(callee.property) ?? '') ||
    args.length !== 1 ||
    argument === undefined
  ) {
    return undefined;
  }
  const resolved = isFunction(argument) ? argument : resolveFunction(context, argument);
  return resolved !== undefined && isFunction(resolved) ? resolved : undefined;
}

function neverEqual(comparator: Comparator): boolean {
  const outcomes = returnedValues(comparator.fn).flatMap(outcomesOf);
  return outcomes.length >= MIN_OUTCOMES && outcomes.every(isNonZeroNumber);
}

function asymmetricBranch(comparator: Comparator): TSESTree.Node | undefined {
  return branchesOf(comparator.fn).find(
    ({ test, outcome, otherwise }) =>
      (testsMissingBothSides(test, comparator) && isSideIndependent(outcome, comparator)) ||
      (testsPresentBothSides(test, comparator) && isSideIndependent(otherwise, comparator)),
  )?.node;
}

export const rule: TSESLint.RuleModule<'neverEqual' | 'asymmetric'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report sort comparators that never return 0 or return one value ' +
        'for both orders of a missing value',
    },
    schema: [],
    messages: {
      neverEqual:
        'This comparator never returns 0, so equal items swap places and the result depends on the ' +
        'engine. Return `a - b`, `a.localeCompare(b)` or `0` when the keys are equal.',
      asymmetric:
        'This branch returns the same value when `a` is missing and when `b` is missing, so the ' +
        'order depends on which one the engine passes first. Handle each side on its own: `a` ' +
        'missing sorts first, `b` missing sorts last.',
    },
  },
  create(context) {
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const fn = sortedWith(context, node);
        const comparator = fn === undefined ? undefined : comparatorOf(fn);
        if (comparator === undefined) {
          return;
        }
        const receiver =
          node.callee.type === AST_NODE_TYPES.MemberExpression ? node.callee.object : node;
        const unique = sortsUniqueItems(receiver, context.sourceCode.getText(comparator.fn));
        if (!unique && neverEqual(comparator)) {
          context.report({ node: comparator.fn, messageId: 'neverEqual' });
          return;
        }
        const branch = asymmetricBranch(comparator);
        if (branch !== undefined) {
          context.report({ node: branch, messageId: 'asymmetric' });
        }
      },
    };
  },
};
