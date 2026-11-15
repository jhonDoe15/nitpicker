import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';

function returnsFailureResult(node: TSESTree.CatchClause): boolean {
  return node.body.body.some(
    (statement) =>
      statement.type === AST_NODE_TYPES.ReturnStatement &&
      statement.argument?.type === AST_NODE_TYPES.ObjectExpression,
  );
}

export const rule: TSESLint.RuleModule<'silent'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a catch clause to use the caught value or return a failure result, not discard it',
    },
    schema: [],
    messages: {
      silent:
        "This catch discards the failure. Return a failure result (`return { kind: 'malformed-json' }`), or rethrow an Error subclass with `{ cause: error }`. An exception fits only when dropping it is intended.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      'CatchClause:exit'(node) {
        const variables = sourceCode.getDeclaredVariables(node);
        const hasReference = variables.some((variable) => variable.references.length > 0);
        if (!(hasReference || returnsFailureResult(node))) {
          context.report({ node, messageId: 'silent' });
        }
      },
    };
  },
};
