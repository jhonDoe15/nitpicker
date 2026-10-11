function returnsFailureResult(node) {
  return node.body.body.some(
    (statement) =>
      statement.type === 'ReturnStatement' && statement.argument?.type === 'ObjectExpression',
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a catch clause to use the caught value or return a failure result, not discard it',
    },
    schema: [],
    messages: {
      silent:
        "This catch discards the failure. Return a failure result (`return { kind: 'malformed-json' }`), or rethrow an Error subclass with `{ cause: error }`. If dropping it is intended, add an exception for this rule in nitpicker.config.json.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      'CatchClause:exit'(node) {
        const variables = sourceCode.getDeclaredVariables(node);
        const hasReference = variables.some((variable) => variable.references.length > 0);
        if (!hasReference && !returnsFailureResult(node)) {
          context.report({ node, messageId: 'silent' });
        }
      },
    };
  },
};
