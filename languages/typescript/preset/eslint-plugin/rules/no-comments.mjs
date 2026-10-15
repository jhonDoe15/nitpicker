import {
  bodyLines,
  firstCommentedOutCodeLine,
  unreferencedWorkTagLines,
} from '../../../../../shared/comments/comment-checks.mjs';
import { castTags, isJsdocBlock, parseJsdoc } from '../../../../javascript/preset/jsdoc.mjs';

const typescriptSuppression = /@ts-(?:ignore|expect-error|nocheck)\b/;
const eslintSuppression = /^\s*eslint-(?:disable|enable)\b/;
const coverageSuppression = /^[\s*]*((?:istanbul|c8|v8)\s+ignore|stryker\s+(?:disable|restore))\b/i;
const exportDeclarations = new Set(['ExportNamedDeclaration', 'ExportDefaultDeclaration']);
const typeMembers = new Set(['TSPropertySignature', 'TSMethodSignature']);
const JSDOC_EXCEPTION =
  'If this is legitimate, add an exception for nitpicker/no-comments in nitpicker.config.json.';
const toolDirective =
  /^\s*(?:eslint\b|prettier-ignore|@ts-check\b|@vitest-environment\b|@jsx\b|@jsxImportSource\b|\/\s*<reference\b|#(?:region|endregion)\b)/;

function suppressionReport(comment) {
  const suppression = typescriptSuppression.exec(comment.value);
  if (suppression) {
    return [{ messageId: 'typescriptSuppression', data: { directive: suppression[0] } }];
  }
  const coverage = coverageSuppression.exec(comment.value);
  if (coverage) {
    return [
      { messageId: 'coverageSuppression', data: { directive: coverage[1].replace(/\s+/g, ' ') } },
    ];
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

function declarationStartingAt(sourceCode, token) {
  const innermost = sourceCode.getNodeByRangeIndex(token.range[0]);
  if (!innermost) return undefined;
  return [...sourceCode.getAncestors(innermost), innermost].find(
    (node) => node.type !== 'Program' && node.range[0] === token.range[0],
  );
}

function isExportedTypeMember(node) {
  if (!typeMembers.has(node.type)) return false;
  const typeLiteral = node.parent;
  const alias = typeLiteral?.parent;
  return (
    typeLiteral?.type === 'TSTypeLiteral' &&
    alias?.type === 'TSTypeAliasDeclaration' &&
    exportDeclarations.has(alias.parent?.type)
  );
}

function documentsPublicApi(sourceCode, comment) {
  const token = sourceCode.getTokenAfter(comment);
  if (!token) return false;
  const node = declarationStartingAt(sourceCode, token);
  if (!node) return false;
  return exportDeclarations.has(node.type) || isExportedTypeMember(node);
}

function publicApiDocReports(comment) {
  const lines = bodyLines(comment.value);
  return [
    ...(unreferencedWorkTagLines(lines).length > 0 ? [{ messageId: 'todoWithoutIssue' }] : []),
    ...(firstCommentedOutCodeLine(lines) >= 0 ? [{ messageId: 'commentedOutCode' }] : []),
  ];
}

function plainCommentReports(comment, sourceCode) {
  if (toolDirective.test(comment.value)) return [];
  if (!isJsdocBlock(comment)) return [{ messageId: 'comment' }];
  return documentsPublicApi(sourceCode, comment)
    ? publicApiDocReports(comment)
    : [{ messageId: 'internalDocComment' }];
}

function commentReports(comment, { jsdocTypes, sourceCode }) {
  const suppression = suppressionReport(comment);
  if (suppression !== undefined) {
    return suppression;
  }
  if (jsdocTypes && isJsdocBlock(comment)) {
    return jsdocReports(comment, sourceCode);
  }
  return plainCommentReports(comment, sourceCode);
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Allow only non-suppression tool directives as comments, plus doc comments on exported API',
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
      coverageSuppression:
        'Test this code instead; coverage and mutation ignore comments ({{directive}}) hide untested code. If it truly cannot be tested, add an exception for nitpicker/no-comments in nitpicker.config.json.',
      comment:
        'Remove the comment and put the intent in code: a descriptive identifier, a named function, or a type. Only non-suppression tool directives may be comments.',
      jsdocProse:
        'JSDoc holds types only: remove the description text and put the intent in a descriptive identifier or a named function.',
      jsdocUnsupportedTag: `The JSDoc tag @{{tag}} is not allowed: JSDoc holds types only (@param, @returns, @type, @typedef, @template, @import). ${JSDOC_EXCEPTION}`,
      jsdocMalformed: 'Write the JSDoc tag as `{{usage}}`.',
      jsdocAnyType: `Do not use \`any\`, \`*\` or a bare \`?\` in a JSDoc type. Use \`unknown\` and parse it into a specific type at the boundary with zod, or write the specific type. ${JSDOC_EXCEPTION}`,
      jsdocNullType: `Use \`undefined\` for an absent value; \`null\` and the \`?T\` and \`T?\` forms are not allowed in a JSDoc type. Type it as optional with \`undefined\`. ${JSDOC_EXCEPTION}`,
      jsdocCast: `Do not assert with a JSDoc cast (\`/** @type {T} */ (value)\`). Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. \`/** @type {const} */\` is allowed. ${JSDOC_EXCEPTION}`,
      todoWithoutIssue: `A TODO or FIXME needs an issue reference: write \`TODO(#123): ...\` or \`TODO PROJ-123: ...\`, or do the work now. ${JSDOC_EXCEPTION}`,
      commentedOutCode: `Delete the commented-out code; version control keeps it. ${JSDOC_EXCEPTION}`,
      internalDocComment:
        'Doc comments are allowed only on exported declarations and the members of exported types. Remove this one and put the intent in code: a descriptive identifier, a named function, or a type.',
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
