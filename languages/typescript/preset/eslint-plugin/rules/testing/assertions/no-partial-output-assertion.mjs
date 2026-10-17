import { chainOf } from '../../analysis/ancestry.mjs';
import { isExpectCall, memberName } from '../../analysis/test-code-analysis.mjs';

const PARTIAL_MATCHERS = new Set(['toContain', 'toContainEqual', 'toMatch']);
const WHOLE_VALUE_MATCHERS = new Set(['toEqual', 'toStrictEqual']);
const PARTIAL_ASYMMETRIC_MATCHERS = new Set([
  'objectContaining',
  'stringContaining',
  'arrayContaining',
]);

function matcherChain(callee) {
  return chainOf(callee.object, (link) =>
    link.type === 'MemberExpression' ? link.object : undefined,
  );
}

function isNegatedExpectation(callee) {
  return matcherChain(callee).some(
    (link) => link.type === 'MemberExpression' && memberName(link) === 'not',
  );
}

function startsFromExpect(callee) {
  const root = matcherChain(callee).at(-1);
  return root !== undefined && isExpectCall(root);
}

function isTextArgument(node) {
  return (
    (node?.type === 'Literal' && typeof node.value === 'string') || node?.type === 'TemplateLiteral'
  );
}

function isAnchoredPattern(node) {
  const pattern = node.regex?.pattern;
  return pattern?.startsWith('^') === true && pattern.endsWith('$') && !pattern.endsWith('\\$');
}

function isFragmentMatch(node) {
  const argument = node.arguments[0];
  if (argument?.type === 'Literal' && argument.regex !== undefined) {
    return !isAnchoredPattern(argument);
  }
  return isTextArgument(argument);
}

function isPositiveExpectation(callee) {
  return startsFromExpect(callee) && !isNegatedExpectation(callee);
}

function isPartialAssertion(node) {
  const callee = node.callee;
  if (callee.type !== 'MemberExpression') return false;
  const matcher = memberName(callee);
  if (!PARTIAL_MATCHERS.has(matcher)) return false;
  if (matcher === 'toContain' && !isTextArgument(node.arguments[0])) return false;
  if (matcher === 'toMatch' && !isFragmentMatch(node)) return false;
  return isPositiveExpectation(callee);
}

function isPartialAsymmetricMatcher(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.object.type === 'Identifier' &&
    node.callee.object.name === 'expect' &&
    PARTIAL_ASYMMETRIC_MATCHERS.has(memberName(node.callee))
  );
}

function expectedValueParts(node) {
  if (node.type === 'ObjectExpression') {
    return node.properties.map((property) =>
      property.type === 'Property' ? property.value : property,
    );
  }
  if (node.type === 'ArrayExpression') return node.elements.filter((element) => element !== null);
  if (node.type === 'SpreadElement') return [node.argument];
  return [];
}

function containsPartialMatcher(expected) {
  const pending = [expected];
  for (const node of pending) {
    if (isPartialAsymmetricMatcher(node)) return true;
    pending.push(...expectedValueParts(node));
  }
  return false;
}

function isPartialMatcherAssertion(node) {
  const callee = node.callee;
  if (callee.type !== 'MemberExpression' || !isPositiveExpectation(callee)) return false;
  const matcher = memberName(callee);
  if (matcher === 'toMatchObject') return true;
  return WHOLE_VALUE_MATCHERS.has(matcher) && node.arguments.some(containsPartialMatcher);
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require tests to assert the whole output instead of a fragment of it',
    },
    schema: [],
    messages: {
      partialOutput:
        'Assert the whole output with `toEqual` or `toBe` instead of checking that it contains a fragment (`toContain`, or `toMatch` with a pattern that is not anchored `^...$`): a fragment passes even when the rest is wrong. If the output is too large or unordered to pin, add an exception for this rule in nitpicker.config.json.',
      partialMatcher:
        'Pass the whole expected value to `toEqual` instead of a partial match (`toMatchObject`, `expect.objectContaining`, `expect.stringContaining`, `expect.arrayContaining`): the rest of the value goes unchecked. Use `expect.any(Type)` for a field that varies. If the value is too large or unordered to pin, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isPartialAssertion(node)) {
          context.report({ node: node.callee.property, messageId: 'partialOutput' });
        } else if (isPartialMatcherAssertion(node)) {
          context.report({ node: node.callee.property, messageId: 'partialMatcher' });
        }
      },
    };
  },
};
