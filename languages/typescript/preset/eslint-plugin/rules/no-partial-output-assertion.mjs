import { chainOf } from './ancestry.mjs';

const PARTIAL_MATCHERS = new Set(['toContain', 'toContainEqual']);

function propertyName(member) {
  return !member.computed && member.property.type === 'Identifier' ? member.property.name : '';
}

function isExpectCall(node) {
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (callee.type === 'Identifier') return callee.name === 'expect';
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'expect'
  );
}

function matcherChain(callee) {
  return chainOf(callee.object, (link) =>
    link.type === 'MemberExpression' ? link.object : undefined,
  );
}

function isNegatedExpectation(callee) {
  return matcherChain(callee).some(
    (link) => link.type === 'MemberExpression' && propertyName(link) === 'not',
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

function isPartialAssertion(node) {
  const callee = node.callee;
  if (callee.type !== 'MemberExpression') return false;
  const matcher = propertyName(callee);
  if (!PARTIAL_MATCHERS.has(matcher)) return false;
  if (matcher === 'toContain' && !isTextArgument(node.arguments[0])) return false;
  return startsFromExpect(callee) && !isNegatedExpectation(callee);
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
        'Assert the whole output with `toEqual` or `toBe` instead of checking that it contains a fragment: a fragment passes even when the rest is wrong. If the output is too large or unordered to pin, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isPartialAssertion(node)) {
          context.report({ node: node.callee.property, messageId: 'partialOutput' });
        }
      },
    };
  },
};
