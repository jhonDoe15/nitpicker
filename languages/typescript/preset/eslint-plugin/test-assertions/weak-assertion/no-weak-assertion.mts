import type { TSESLint } from '@typescript-eslint/utils';
import { assertForm } from './assert-forms.mts';
import { expectForm } from './expect-forms.mts';
import { assertText, EXCEPTION_ROUTE, expectText } from './found-text.mts';
import { isNarrowedLater } from './narrowing.mts';

const messages = {
  presenceMatcher: `\`{{found}}\` passes for any value but {{absent}}, the same weak check as \`not.toBeNull\`. Assert the value itself with \`toBe\` or \`toEqual\`, such as \`expect(user).toEqual({ id: 1 })\`. ${EXCEPTION_ROUTE}`,
  presenceAssert: `\`{{found}}\` passes for any value but {{absent}}. Assert the value itself, such as \`assert.deepStrictEqual(user, { id: 1 })\` or \`assert.strictEqual(user.id, 1)\`. ${EXCEPTION_ROUTE}`,
  nonEmptyMatcher: `\`{{found}}\` passes for any non-empty value. Assert the contents or the exact length, such as \`expect(rows).toEqual([...])\` or \`expect(rows).toHaveLength(3)\`. ${EXCEPTION_ROUTE}`,
  nonEmptyAssert: `\`{{found}}\` passes for any non-empty value. Assert the contents or the exact length, such as \`assert.deepStrictEqual(rows, [...])\` or \`assert.strictEqual(rows.length, 3)\`. ${EXCEPTION_ROUTE}`,
  wildcardCall: `\`{{found}}\` passes for a call with any arguments. Pass the values the call should receive, such as \`expect(spy).toHaveBeenCalledWith(orderId)\`; keep \`expect.any(Type)\` for an argument that varies and pin the others. ${EXCEPTION_ROUTE}`,
};

const MATCHER_FAMILIES = { presence: 'presenceMatcher', nonEmpty: 'nonEmptyMatcher' } as const;
const ASSERT_FAMILIES = { presence: 'presenceAssert', nonEmpty: 'nonEmptyAssert' } as const;

export const rule: TSESLint.RuleModule<keyof typeof messages> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require tests to pin the value, its contents or length, and the call arguments instead of a weak check',
    },
    schema: [],
    messages,
  },
  create(context) {
    const { sourceCode } = context;
    return {
      CallExpression(node) {
        const matcher = expectForm(node);
        if (matcher) {
          context.report({
            node: matcher.expectation.property,
            messageId:
              matcher.family === 'wildcardCall' ? 'wildcardCall' : MATCHER_FAMILIES[matcher.family],
            data: {
              found: expectText(sourceCode, matcher),
              absent: 'absent' in matcher ? matcher.absent : '',
            },
          });
          return;
        }
        const assertion = assertForm(node);
        if (assertion && !isNarrowedLater(sourceCode, node, assertion.narrowed)) {
          context.report({
            node,
            messageId: ASSERT_FAMILIES[assertion.family],
            data: { found: assertText(sourceCode, node), absent: assertion.absent ?? '' },
          });
        }
      },
    };
  },
};
