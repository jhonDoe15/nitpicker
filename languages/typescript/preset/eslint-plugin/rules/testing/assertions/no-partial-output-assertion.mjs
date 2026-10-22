import { chainOf } from '../../analysis/ancestry.mjs';
import { isExpectCall, memberName } from '../../analysis/test-code-analysis.mjs';
import {
  isFragmentMatch,
  isTextArgument,
  runnerAssertionVerdict,
} from '../runners/runner-assertions.mjs';
import { RUNNER_OPTION_SCHEMA, vocabularyOf } from '../runners/runner-option.mjs';

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

function isPositiveExpectation(callee) {
  return startsFromExpect(callee) && !isNegatedExpectation(callee);
}

function isPartialAssertion(node) {
  const callee = node.callee;
  if (callee.type !== 'MemberExpression') {
    return false;
  }
  const matcher = memberName(callee);
  if (!PARTIAL_MATCHERS.has(matcher)) {
    return false;
  }
  if (matcher === 'toContain' && !isTextArgument(node.arguments[0])) {
    return false;
  }
  if (matcher === 'toMatch' && !isFragmentMatch(node.arguments[0])) {
    return false;
  }
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
  if (node.type === 'ArrayExpression') {
    return node.elements.filter((element) => element !== null);
  }
  if (node.type === 'SpreadElement') {
    return [node.argument];
  }
  return [];
}

function containsPartialMatcher(expected) {
  const pending = [expected];
  for (const node of pending) {
    if (isPartialAsymmetricMatcher(node)) {
      return true;
    }
    pending.push(...expectedValueParts(node));
  }
  return false;
}

function isPartialMatcherAssertion(node) {
  const callee = node.callee;
  if (callee.type !== 'MemberExpression' || !isPositiveExpectation(callee)) {
    return false;
  }
  const matcher = memberName(callee);
  if (matcher === 'toMatchObject') {
    return true;
  }
  return WHOLE_VALUE_MATCHERS.has(matcher) && node.arguments.some(containsPartialMatcher);
}

function verdictOf(node) {
  if (isPartialAssertion(node)) {
    return 'partialOutput';
  }
  return isPartialMatcherAssertion(node) ? 'partialMatcher' : runnerAssertionVerdict(node);
}

function reportedNode(node) {
  return node.callee.type === 'MemberExpression' ? node.callee.property : node.callee;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require tests to assert the whole output instead of a fragment of it',
    },
    schema: RUNNER_OPTION_SCHEMA,
    messages: {
      partialOutput:
        'Assert the whole output with {{wholeOutput}} instead of checking that it contains a fragment ({{fragmentForms}}): a fragment passes even when the rest is wrong. An exception fits only when the output is too large or unordered to pin.',
      partialMatcher:
        'Pass the whole expected value to {{wholeValue}} instead of a partial match ({{partialForms}}): the rest of the value goes unchecked. {{variedField}} An exception fits only when the value is too large or unordered to pin.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const messageId = verdictOf(node);
        if (messageId === undefined) {
          return;
        }
        const { wholeOutput, fragmentForms, wholeValue, partialForms, variedField } =
          vocabularyOf(context);
        context.report({
          node: reportedNode(node),
          messageId,
          data: { wholeOutput, fragmentForms, wholeValue, partialForms, variedField },
        });
      },
    };
  },
};
