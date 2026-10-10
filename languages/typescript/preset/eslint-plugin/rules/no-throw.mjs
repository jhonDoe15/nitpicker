export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow throw so expected failures are returned as discriminated unions',
    },
    schema: [],
    messages: {
      noThrow:
        'Return a discriminated-union failure result (for example { kind: "failed", reason }) instead of throwing.',
    },
  },
  create(context) {
    return {
      ThrowStatement(node) {
        context.report({ node, messageId: 'noThrow' });
      },
    };
  },
};
