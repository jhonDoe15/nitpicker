import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { chainOf } from '../typed/node-views.mts';
import { isExpectCall, memberName } from '../analysis/test-code-analysis.mts';

const PARTIAL_OUTPUT = 'partialOutput';
const PARTIAL_MATCHER = 'partialMatcher';

export type AssertionVerdict = typeof PARTIAL_OUTPUT | typeof PARTIAL_MATCHER | undefined;
type Argument = TSESTree.CallExpressionArgument | undefined;

const ASSERT_NAMESPACE = 'assert';
const TRUTHY_ASSERTIONS = new Set(['ok', 'isTrue']);
const ASSERT_PARTIAL_OUTPUT = new Set(['deepInclude', 'deepNestedInclude', 'deepOwnInclude']);
const ASSERT_PARTIAL_MATCHERS = new Set([
  'partialDeepStrictEqual',
  'containSubset',
  'includeMembers',
  'includeDeepMembers',
  'includeOrderedMembers',
  'includeDeepOrderedMembers',
]);
const CHAI_INCLUDES = new Set(['include', 'includes', 'contain', 'contains']);
const CHAI_PARTIAL_MATCHERS = new Set(['containSubset']);

export function isTextArgument(node: TSESTree.Node | undefined): boolean {
  return (
    (node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') ||
    node?.type === AST_NODE_TYPES.TemplateLiteral
  );
}

function isAnchoredPattern(node: TSESTree.RegExpLiteral): boolean {
  const { pattern } = node.regex;
  return pattern.startsWith('^') && pattern.endsWith('$') && !pattern.endsWith('\\$');
}

function isFragmentPattern(node: TSESTree.Node | undefined): boolean {
  return node?.type === AST_NODE_TYPES.Literal && 'regex' in node && !isAnchoredPattern(node);
}

export function isFragmentMatch(argument: TSESTree.Node | undefined): boolean {
  return isFragmentPattern(argument) || isTextArgument(argument);
}

function isAssertNamespace(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Identifier && node.name === ASSERT_NAMESPACE) ||
    memberName(node) === ASSERT_NAMESPACE
  );
}

function assertMethod(callee: TSESTree.Node): string {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === ASSERT_NAMESPACE ? 'ok' : '';
  }
  return callee.type === AST_NODE_TYPES.MemberExpression && isAssertNamespace(callee.object)
    ? (memberName(callee) ?? '')
    : '';
}

function isIncludesCall(node: Argument): boolean {
  return (
    node?.type === AST_NODE_TYPES.CallExpression &&
    memberName(node.callee) === 'includes' &&
    isTextArgument(node.arguments[0])
  );
}

function textVerdict(node: Argument): AssertionVerdict {
  return isTextArgument(node) ? PARTIAL_OUTPUT : undefined;
}

function includedValueVerdict(expected: Argument): AssertionVerdict {
  return expected?.type === AST_NODE_TYPES.ObjectExpression
    ? PARTIAL_MATCHER
    : textVerdict(expected);
}

function assertVerdict(node: TSESTree.CallExpression): AssertionVerdict {
  const method = assertMethod(node.callee);
  const [actual, expected] = node.arguments;
  if (TRUTHY_ASSERTIONS.has(method) && isIncludesCall(actual)) {
    return PARTIAL_OUTPUT;
  }
  if (method === 'include') {
    return includedValueVerdict(expected);
  }
  if (method === 'match') {
    return isFragmentPattern(expected) ? PARTIAL_OUTPUT : undefined;
  }
  if (ASSERT_PARTIAL_OUTPUT.has(method)) {
    return PARTIAL_OUTPUT;
  }
  return ASSERT_PARTIAL_MATCHERS.has(method) ? PARTIAL_MATCHER : undefined;
}

function chaiLinks(callee: TSESTree.MemberExpression): TSESTree.Node[] {
  return chainOf<TSESTree.Node>(callee.object, (link) =>
    link.type === AST_NODE_TYPES.MemberExpression ? link.object : undefined,
  );
}

function chaiMethodVerdict(
  node: TSESTree.CallExpression,
  links: readonly (string | undefined)[],
): AssertionVerdict {
  const method = memberName(node.callee) ?? '';
  if (CHAI_INCLUDES.has(method)) {
    return links.includes('deep') ? PARTIAL_OUTPUT : includedValueVerdict(node.arguments[0]);
  }
  if (method === 'string') {
    return textVerdict(node.arguments[0]);
  }
  if (method === 'match' || method === 'matches') {
    return isFragmentPattern(node.arguments[0]) ? PARTIAL_OUTPUT : undefined;
  }
  if (method === 'members' && links.some((link) => link !== undefined && CHAI_INCLUDES.has(link))) {
    return PARTIAL_MATCHER;
  }
  return CHAI_PARTIAL_MATCHERS.has(method) ? PARTIAL_MATCHER : undefined;
}

function chaiVerdict(
  node: TSESTree.CallExpression,
  callee: TSESTree.MemberExpression,
): AssertionVerdict {
  const chain = chaiLinks(callee);
  if (!isExpectCall(chain.at(-1))) {
    return undefined;
  }
  const links = chain.map((link) => memberName(link));
  return links.includes('not') ? undefined : chaiMethodVerdict(node, links);
}

export function runnerAssertionVerdict(node: TSESTree.CallExpression): AssertionVerdict {
  const { callee } = node;
  return callee.type === AST_NODE_TYPES.MemberExpression && !isAssertNamespace(callee.object)
    ? chaiVerdict(node, callee)
    : assertVerdict(node);
}
