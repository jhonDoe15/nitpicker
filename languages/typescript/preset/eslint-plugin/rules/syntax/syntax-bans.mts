import type { JSONSchema, TSESLint, TSESTree } from '@typescript-eslint/utils';

type Restriction = { readonly selector: string; readonly message: string };
type Options = readonly Restriction[];

const restrictionSchema: JSONSchema.JSONSchema4 = {
  type: 'array',
  items: {
    type: 'object',
    properties: { selector: { type: 'string' }, message: { type: 'string' } },
    required: ['selector', 'message'],
    additionalProperties: false,
  },
};

/** A rule that reports each selector of its options with the option's message. */
export function syntaxBan(description: string): TSESLint.RuleModule<'banned', Options> {
  return {
    meta: {
      type: 'suggestion',
      docs: { description },
      schema: restrictionSchema,
      messages: { banned: '{{ message }}' },
    },
    create(context) {
      return Object.fromEntries(
        context.options.map(({ selector, message }) => [
          selector,
          (node: TSESTree.Node) => {
            context.report({ node, messageId: 'banned', data: { message } });
          },
        ]),
      );
    },
  };
}
