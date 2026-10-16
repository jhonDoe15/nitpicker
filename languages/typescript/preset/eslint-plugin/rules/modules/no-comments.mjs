import { docCommentContentReports } from './doc-comment-content.mjs';
import {
  castTags,
  isJsdocBlock,
  parseJsdoc,
} from '../../../../../javascript/preset/documentation/jsdoc.mjs';

const typescriptSuppression = /@ts-(?:ignore|expect-error|nocheck)\b/;
const eslintSuppression = /^\s*eslint-(?:disable|enable)\b/;
const coverageSuppression = /^[\s*]*((?:istanbul|c8|v8)\s+ignore|stryker\s+(?:disable|restore))\b/i;
const exportDeclarations = new Set(['ExportNamedDeclaration', 'ExportDefaultDeclaration']);
const typeMembers = new Set(['TSPropertySignature', 'TSMethodSignature']);
const JSDOC_EXCEPTION =
  'If this is legitimate, add an exception for nitpicker/no-comments in nitpicker.config.json.';
const TOOL_DIRECTIVES = [
  'eslint\\b',
  'prettier-ignore',
  '@ts-check\\b',
  '@vitest-environment\\b',
  '@jest-environment\\b',
  '@jsx\\b',
  '@jsxImportSource\\b',
  '\\/\\s*<reference\\b',
  '#(?:region|endregion)\\b',
];
const toolDirective = new RegExp(`^\\s*(?:${TOOL_DIRECTIVES.join('|')})`);

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

function publicApiNode(sourceCode, comment) {
  const token = sourceCode.getTokenAfter(comment);
  if (!token) return undefined;
  const node = declarationStartingAt(sourceCode, token);
  if (!node) return undefined;
  return exportDeclarations.has(node.type) || isExportedTypeMember(node) ? node : undefined;
}

function plainCommentReports(comment, sourceCode) {
  if (toolDirective.test(comment.value)) return [];
  if (!isJsdocBlock(comment)) return [{ messageId: 'comment' }];
  const node = publicApiNode(sourceCode, comment);
  if (!node) return [{ messageId: 'internalDocComment' }];
  return docCommentContentReports(comment, node);
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
        'Fix the type error or narrow the value; TypeScript suppression comments ({{directive}}) are not allowed. ' +
        'To test that a type rejects a value, assert `expectTypeOf(fn).parameter(0).not.toExtend<Value>()`.',
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
      restatingDocComment:
        'This doc comment only restates {{name}}. Delete it, or say what the name cannot: a unit, a limit, an edge case or why. If it is needed as written, add an exception for nitpicker/no-comments in nitpicker.config.json.',
      longDocComment:
        "This doc comment's description is {{lines}} lines (limit {{limit}}). Keep the non-obvious point, a unit, a limit or an edge case, and put the rest in names and types. If it must be longer, add an exception for nitpicker/no-comments in nitpicker.config.json.",
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
