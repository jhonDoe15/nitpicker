import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isExpectCall, memberName } from '../../analysis/test-code-analysis.mts';
import { chainOf } from '../../typed/node-views.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';
import {
  type AssertionVerdict,
  isFragmentMatch,
  isTextArgument,
  runnerAssertionVerdict,
} from '../../runner-apis/runner-assertions.mts';
import { RUNNER_OPTION_SCHEMA, vocabularyOf } from '../../runner-apis/runner-option.mts';

type MemberCall = TSESTree.CallExpression & { readonly callee: TSESTree.MemberExpression };

const PARTIAL_MATCHERS = new Set(['toContain', 'toContainEqual', 'toMatch']);
const WHOLE_VALUE_MATCHERS = new Set(['toEqual', 'toStrictEqual']);
const PARTIAL_ASYMMETRIC_MATCHERS = new Set([
  'objectContaining',
  'stringContaining',
  'arrayContaining',
]);

function matcherChain(callee: TSESTree.MemberExpression): TSESTree.Node[] {
  return chainOf<TSESTree.Node>(callee.object, (link) =>
    link.type === AST_NODE_TYPES.MemberExpression ? link.object : undefined,
  );
}

function isNegatedExpectation(callee: TSESTree.MemberExpression): boolean {
  return matcherChain(callee).some(
    (link) => link.type === AST_NODE_TYPES.MemberExpression && memberName(link) === 'not',
  );
}

function startsFromExpect(callee: TSESTree.MemberExpression): boolean {
  const root = matcherChain(callee).at(-1);
  return root !== undefined && isExpectCall(root);
}

function isPositiveExpectation(callee: TSESTree.MemberExpression): boolean {
  return startsFromExpect(callee) && !isNegatedExpectation(callee);
}

function isPartialAssertion(node: TSESTree.CallExpression): node is MemberCall {
  const callee = node.callee;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const matcher = memberName(callee);
  if (matcher === undefined || !PARTIAL_MATCHERS.has(matcher)) {
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

function isPartialAsymmetricMatcher(node: TSESTree.Node): boolean {
  const name = node.type === AST_NODE_TYPES.CallExpression ? memberName(node.callee) : undefined;
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    node.callee.object.type === AST_NODE_TYPES.Identifier &&
    node.callee.object.name === 'expect' &&
    name !== undefined &&
    PARTIAL_ASYMMETRIC_MATCHERS.has(name)
  );
}

function expectedValueParts(node: TSESTree.Node): TSESTree.Node[] {
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    return node.properties.map((property) =>
      property.type === AST_NODE_TYPES.Property ? property.value : property,
    );
  }
  if (node.type === AST_NODE_TYPES.ArrayExpression) {
    return node.elements.filter((element) => element !== null);
  }
  if (node.type === AST_NODE_TYPES.SpreadElement) {
    return [node.argument];
  }
  return [];
}

function containsPartialMatcher(expected: TSESTree.Node): boolean {
  const pending = [expected];
  for (const node of pending) {
    if (isPartialAsymmetricMatcher(node)) {
      return true;
    }
    appendAll(pending, expectedValueParts(node));
  }
  return false;
}

function isPartialMatcherAssertion(node: TSESTree.CallExpression): node is MemberCall {
  const callee = node.callee;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || !isPositiveExpectation(callee)) {
    return false;
  }
  const matcher = memberName(callee);
  if (matcher === 'toMatchObject') {
    return true;
  }
  return (
    matcher !== undefined &&
    WHOLE_VALUE_MATCHERS.has(matcher) &&
    node.arguments.some(containsPartialMatcher)
  );
}

function verdictOf(node: TSESTree.CallExpression): AssertionVerdict {
  if (isPartialAssertion(node)) {
    return 'partialOutput';
  }
  return isPartialMatcherAssertion(node) ? 'partialMatcher' : runnerAssertionVerdict(node);
}

function reportedNode(node: TSESTree.CallExpression): TSESTree.Node {
  return node.callee.type === AST_NODE_TYPES.MemberExpression ? node.callee.property : node.callee;
}

export const rule: TSESLint.RuleModule<'partialOutput' | 'partialMatcher'> = {
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
