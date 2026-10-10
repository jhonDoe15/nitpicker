const typescriptSuppression = /@ts-(?:ignore|expect-error|nocheck)\b/;
const eslintSuppression = /^\s*eslint-(?:disable|enable)\b/;
const toolDirective =
  /^\s*(?:eslint\b|prettier-ignore|istanbul\b|c8\b|v8\b|stryker\b|@ts-check\b|@vitest-environment\b|@jsx\b|@jsxImportSource\b|\/\s*<reference\b|#(?:region|endregion)\b)/;

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Allow only non-suppression tool directives as comments',
    },
    schema: [],
    messages: {
      typescriptSuppression:
        'Fix the type error or narrow the value; TypeScript suppression comments ({{directive}}) are not allowed.',
      eslintSuppression:
        'Fix the violation; inline ESLint disables are not allowed. A reviewed exception belongs in the nitpicker config file.',
      comment:
        'Remove the comment and put the intent in code: a descriptive identifier, a named function, or a type. Only non-suppression tool directives may be comments.',
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type === 'Shebang') continue;
          const suppression = typescriptSuppression.exec(comment.value);
          if (suppression) {
            context.report({
              loc: comment.loc,
              messageId: 'typescriptSuppression',
              data: { directive: suppression[0] },
            });
          } else if (eslintSuppression.test(comment.value)) {
            context.report({ loc: comment.loc, messageId: 'eslintSuppression' });
          } else if (!toolDirective.test(comment.value)) {
            context.report({ loc: comment.loc, messageId: 'comment' });
          }
        }
      },
    };
  },
};
