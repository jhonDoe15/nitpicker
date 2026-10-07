export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require caught failures to remain observable or affect the typed result',
    },
    schema: [],
    messages: {
      missingBinding: 'Capture the caught value so the failure cannot be silently discarded.',
      silent: 'Reference, propagate, or log the caught value before continuing.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      'CatchClause:exit'(node) {
        if (node.param === null) {
          context.report({ node, messageId: 'missingBinding' });
          return;
        }

        const variables = sourceCode.getDeclaredVariables(node);
        const hasReference = variables.some((variable) => variable.references.length > 0);
        if (!hasReference) {
          context.report({ node, messageId: 'silent' });
        }
      },
    };
  },
};
