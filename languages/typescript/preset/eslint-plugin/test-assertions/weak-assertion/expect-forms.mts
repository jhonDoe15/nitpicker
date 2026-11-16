import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { chainOf } from '../../rules/typed/node-views.mts';
import { isExpectCall, memberName } from '../../rules/analysis/test-code-analysis.mts';
import {
  isEmptyLiteral,
  isNumber,
  lengthName,
  nonEmptyComparison,
  nullishName,
} from './values.mts';

type Expectation = {
  readonly matcher: string;
  readonly negated: boolean;
  readonly path: string;
  readonly property: TSESTree.Node;
  readonly subject: TSESTree.Node | undefined;
  readonly args: readonly TSESTree.CallExpressionArgument[];
};
export type ExpectForm = (
  | { readonly family: 'presence'; readonly absent: string }
  | { readonly family: 'nonEmpty' }
  | { readonly family: 'wildcardCall' }
) & { readonly expectation: Expectation };
type Family =
  { readonly family: 'presence'; readonly absent: string } | { readonly family: 'nonEmpty' };

const MODIFIERS = new Set(['not', 'resolves', 'rejects']);

const EQUALITY_MATCHERS = new Set(['toBe', 'toEqual', 'toStrictEqual']);
const DEEP_EQUALITY_MATCHERS = new Set(['toEqual', 'toStrictEqual']);
const CALLED_WITH_MATCHERS = new Map<string, number>([
  ['toHaveBeenCalledWith', 0],
  ['toBeCalledWith', 0],
  ['toHaveBeenLastCalledWith', 0],
  ['lastCalledWith', 0],
  ['toHaveBeenNthCalledWith', 1],
  ['nthCalledWith', 1],
  ['toHaveBeenCalledExactlyOnceWith', 0],
  ['toHaveBeenCalledOnceWith', 0],
]);
const WILDCARD_NAMES = new Set(['anything', 'any']);

function parseExpectation(call: TSESTree.CallExpression): Expectation | undefined {
  const { callee } = call;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const matcher = memberName(callee);
  if (matcher === undefined) {
    return undefined;
  }
  const links = chainOf(callee.object, (link) =>
    link.type === AST_NODE_TYPES.MemberExpression ? link.object : undefined,
  );
  const root = links.at(-1);
  const modifiers = links.slice(0, -1).map((link) => memberName(link));
  if (!(
    root?.type === AST_NODE_TYPES.CallExpression &&
    isExpectCall(root) &&
    modifiers.every((name) => name !== undefined && MODIFIERS.has(name))
  )) {
    return undefined;
  }
  return {
    matcher,
    property: callee.property,
    negated: modifiers.includes('not'),
    path: [...modifiers.toReversed(), matcher].join('.'),
    subject: root.arguments[0],
    args: call.arguments,
  };
}

function isWildcard(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    node.callee.object.type === AST_NODE_TYPES.Identifier &&
    node.callee.object.name === 'expect' &&
    WILDCARD_NAMES.has(memberName(node.callee) ?? '')
  );
}

function presenceOf(expectation: Expectation): Family | undefined {
  const [expected] = expectation.args;
  const absent = nullishName(expected);
  const isPresence = expectation.negated && EQUALITY_MATCHERS.has(expectation.matcher);
  return isPresence && absent !== undefined ? { family: 'presence', absent } : undefined;
}

function isEmptyAssertion({ matcher, negated, args: [expected] }: Expectation): boolean {
  if (negated && matcher === 'toHaveLength') {
    return isNumber(expected, 0);
  }
  if (!(negated && DEEP_EQUALITY_MATCHERS.has(matcher))) {
    return false;
  }
  return isEmptyLiteral(expected);
}

function isNonEmptyLengthCheck({
  matcher,
  negated,
  subject,
  args: [expected],
}: Expectation): boolean {
  if (lengthName(subject) === undefined) {
    return false;
  }
  if (!negated && matcher === 'toBeGreaterThan') {
    return isNumber(expected, 0);
  }
  if (!negated && matcher === 'toBeGreaterThanOrEqual') {
    return isNumber(expected, 1);
  }
  return negated && EQUALITY_MATCHERS.has(matcher) && isNumber(expected, 0);
}

function isTrueComparison({ matcher, negated, subject, args: [expected] }: Expectation): boolean {
  return (
    !negated &&
    EQUALITY_MATCHERS.has(matcher) &&
    expected?.type === AST_NODE_TYPES.Literal &&
    expected.value === true &&
    nonEmptyComparison(subject) !== undefined
  );
}

function nonEmptyOf(expectation: Expectation): Family | undefined {
  const weak =
    isEmptyAssertion(expectation) ||
    isNonEmptyLengthCheck(expectation) ||
    isTrueComparison(expectation);
  return weak ? { family: 'nonEmpty' } : undefined;
}

function wildcardsOf(expectation: Expectation): { readonly family: 'wildcardCall' } | undefined {
  const skipped = CALLED_WITH_MATCHERS.get(expectation.matcher);
  if (expectation.negated || skipped === undefined) {
    return undefined;
  }
  const checked = expectation.args.slice(skipped);
  const weak = checked.length > 0 && checked.every(isWildcard);
  return weak ? { family: 'wildcardCall' } : undefined;
}

export function expectForm(call: TSESTree.CallExpression): ExpectForm | undefined {
  const expectation = parseExpectation(call);
  if (!expectation) {
    return undefined;
  }
  const form = presenceOf(expectation) ?? nonEmptyOf(expectation) ?? wildcardsOf(expectation);
  return form && { ...form, expectation };
}
