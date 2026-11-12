const restrictionSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: { selector: { type: 'string' }, message: { type: 'string' } },
    required: ['selector', 'message'],
    additionalProperties: false,
  },
};

/** A rule that reports each selector of its options with the option's message. */
export function syntaxBan(description) {
  return {
    meta: { type: 'suggestion', docs: { description }, schema: restrictionSchema },
    create(context) {
      return Object.fromEntries(
        context.options.map(({ selector, message }) => [
          selector,
          (node) => context.report({ node, message }),
        ]),
      );
    },
  };
}
