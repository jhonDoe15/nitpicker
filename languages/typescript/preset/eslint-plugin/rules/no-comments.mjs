import { castTags, isJsdocBlock, parseJsdoc } from '../../../../javascript/preset/jsdoc.mjs';

const typescriptSuppression = /@ts-(?:ignore|expect-error|nocheck)\b/;
const eslintSuppression = /^\s*eslint-(?:disable|enable)\b/;
const toolDirective =
  /^\s*(?:eslint\b|prettier-ignore|istanbul\b|c8\b|v8\b|stryker\b|@ts-check\b|@vitest-environment\b|@jsx\b|@jsxImportSource\b|\/\s*<reference\b|#(?:region|endregion)\b)/;

function suppressionReport(comment) {
  const suppression = typescriptSuppression.exec(comment.value);
  if (suppression) {
    return [{ messageId: 'typescriptSuppression', data: { directive: suppression[0] } }];
  }
  return eslintSuppression.test(comment.value) ? [{ messageId: 'eslintSuppression' }] : undefined;
}

function jsdocReports(comment, sourceCode) {
  const { tags, problems } = parseJsdoc(comment.value);
  const castsNextExpression = sourceCode.getTokenAfter(comment)?.value === '(';
  return [
    ...problems,
    ...(castsNextExpression && castTags(tags).length > 0 ? [{ messageId: 'jsdocCast' }] : []),
  ];
}

function commentReports(comment, { jsdocTypes, sourceCode }) {
  const suppression = suppressionReport(comment);
  if (suppression !== undefined) {
    return suppression;
  }
  if (jsdocTypes && isJsdocBlock(comment)) {
    return jsdocReports(comment, sourceCode);
  }
  return toolDirective.test(comment.value) ? [] : [{ messageId: 'comment' }];
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Allow only non-suppression tool directives as comments',
    },
    schema: [
      {
        type: 'object',
        properties: { jsdocTypes: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
    messages: {
      typescriptSuppression:
        'Fix the type error or narrow the value; TypeScript suppression comments ({{directive}}) are not allowed.',
      eslintSuppression:
        'Fix the violation; inline ESLint disables are not allowed. A reviewed exception belongs in the nitpicker config file.',
      comment:
        'Remove the comment and put the intent in code: a descriptive identifier, a named function, or a type. Only non-suppression tool directives may be comments.',
      jsdocProse:
        'JSDoc holds types only: remove the description text and put the intent in a descriptive identifier or a named function.',
      jsdocUnsupportedTag:
        'The JSDoc tag @{{tag}} is not allowed. JSDoc holds types only: @param, @returns, @type, @typedef, @property, @template, @callback, @satisfies, @import, @overload and @this.',
      jsdocMalformed: 'Write the JSDoc tag as `{{usage}}`.',
      jsdocAnyType:
        'Do not use `any` or `*` in a JSDoc type. Use `unknown` and parse it into a specific type at the boundary with zod, or write the specific type.',
      jsdocNullType:
        'Use `undefined` for an absent value; `null` is not allowed in a JSDoc type. Type it as optional with `undefined`.',
      jsdocCast:
        'Do not assert with a JSDoc cast (`/** @type {T} */ (value)`). Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. `/** @type {const} */` is allowed.',
    },
  },
  create(context) {
    const settings = {
      jsdocTypes: context.options[0]?.jsdocTypes === true,
      sourceCode: context.sourceCode,
    };
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type === 'Shebang') continue;
          for (const report of commentReports(comment, settings)) {
            context.report({ loc: comment.loc, ...report });
          }
        }
      },
    };
  },
};
