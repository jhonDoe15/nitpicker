const restrictionSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: { selector: { type: 'string' }, message: { type: 'string' } },
    required: ['selector', 'message'],
    additionalProperties: false,
  },
};

function syntaxBan(description) {
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

export const noDefaultExport = syntaxBan('Disallow default exports outside config files');
export const noNull = syntaxBan('Disallow null outside the allowed library forms');
export const noPromiseChain = syntaxBan('Disallow then, catch and finally promise chains');
