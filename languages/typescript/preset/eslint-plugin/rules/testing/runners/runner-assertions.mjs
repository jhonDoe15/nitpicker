import { chainOf } from '../../analysis/ancestry.mjs';
import { isExpectCall, memberName } from '../../analysis/test-code-analysis.mjs';

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

export function isTextArgument(node) {
  return (
    (node?.type === 'Literal' && typeof node.value === 'string') || node?.type === 'TemplateLiteral'
  );
}

function isAnchoredPattern(node) {
  const pattern = node.regex?.pattern;
  return pattern?.startsWith('^') === true && pattern.endsWith('$') && !pattern.endsWith('\\$');
}

export function isFragmentPattern(node) {
  return node?.type === 'Literal' && node.regex !== undefined && !isAnchoredPattern(node);
}

export function isFragmentMatch(argument) {
  return isFragmentPattern(argument) || isTextArgument(argument);
}

function isAssertNamespace(node) {
  return (
    (node.type === 'Identifier' && node.name === ASSERT_NAMESPACE) ||
    memberName(node) === ASSERT_NAMESPACE
  );
}

function assertMethod(callee) {
  if (callee.type === 'Identifier') {
    return callee.name === ASSERT_NAMESPACE ? 'ok' : undefined;
  }
  return callee.type === 'MemberExpression' && isAssertNamespace(callee.object)
    ? memberName(callee)
    : undefined;
}

function isIncludesCall(node) {
  return (
    node?.type === 'CallExpression' &&
    memberName(node.callee) === 'includes' &&
    isTextArgument(node.arguments[0])
  );
}

function textVerdict(node) {
  return isTextArgument(node) ? 'partialOutput' : undefined;
}

function includedValueVerdict(expected) {
  return expected?.type === 'ObjectExpression' ? 'partialMatcher' : textVerdict(expected);
}

function assertVerdict(node) {
  const method = assertMethod(node.callee);
  const [actual, expected] = node.arguments;
  if (TRUTHY_ASSERTIONS.has(method) && isIncludesCall(actual)) {
    return 'partialOutput';
  }
  if (method === 'include') {
    return includedValueVerdict(expected);
  }
  if (method === 'match') {
    return isFragmentPattern(expected) ? 'partialOutput' : undefined;
  }
  if (ASSERT_PARTIAL_OUTPUT.has(method)) {
    return 'partialOutput';
  }
  return ASSERT_PARTIAL_MATCHERS.has(method) ? 'partialMatcher' : undefined;
}

function chaiLinks(callee) {
  return chainOf(callee.object, (link) =>
    link.type === 'MemberExpression' ? link.object : undefined,
  );
}

function chaiMethodVerdict(node, links) {
  const method = memberName(node.callee);
  if (CHAI_INCLUDES.has(method)) {
    return links.includes('deep') ? 'partialOutput' : includedValueVerdict(node.arguments[0]);
  }
  if (method === 'string') {
    return textVerdict(node.arguments[0]);
  }
  if (method === 'match' || method === 'matches') {
    return isFragmentPattern(node.arguments[0]) ? 'partialOutput' : undefined;
  }
  if (method === 'members' && links.some((link) => CHAI_INCLUDES.has(link))) {
    return 'partialMatcher';
  }
  return CHAI_PARTIAL_MATCHERS.has(method) ? 'partialMatcher' : undefined;
}

function chaiVerdict(node) {
  const chain = chaiLinks(node.callee);
  if (!isExpectCall(chain.at(-1))) {
    return undefined;
  }
  const links = chain.map((link) => memberName(link));
  return links.includes('not') ? undefined : chaiMethodVerdict(node, links);
}

export function runnerAssertionVerdict(node) {
  return node.callee.type === 'MemberExpression' && !isAssertNamespace(node.callee.object)
    ? chaiVerdict(node)
    : assertVerdict(node);
}
