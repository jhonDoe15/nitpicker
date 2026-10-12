const typescriptSuppression = /@ts-(?:ignore|expect-error|nocheck)\b/;
const eslintSuppression = /^\s*eslint-(?:disable|enable)\b/;
const exportDeclarations = new Set(['ExportNamedDeclaration', 'ExportDefaultDeclaration']);
const typeMembers = new Set(['TSPropertySignature', 'TSMethodSignature']);
const toolDirective =
  /^\s*(?:eslint\b|prettier-ignore|istanbul\b|c8\b|v8\b|stryker\b|@ts-check\b|@vitest-environment\b|@jsx\b|@jsxImportSource\b|\/\s*<reference\b|#(?:region|endregion)\b)/;

function isDocComment(comment) {
  return comment.type === 'Block' && comment.value.startsWith('*');
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

function commentProblem(sourceCode, comment) {
  if (comment.type === 'Shebang') return undefined;
  const suppression = typescriptSuppression.exec(comment.value);
  if (suppression) {
    return { messageId: 'typescriptSuppression', data: { directive: suppression[0] } };
  }
  if (eslintSuppression.test(comment.value)) return { messageId: 'eslintSuppression' };
  if (toolDirective.test(comment.value)) return undefined;
  if (!isDocComment(comment)) return { messageId: 'comment' };
  if (documentsPublicApi(sourceCode, comment)) return undefined;
  return { messageId: 'internalDocComment' };
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Allow only non-suppression tool directives as comments, plus doc comments on exported API',
    },
    schema: [],
    messages: {
      typescriptSuppression:
        'Fix the type error or narrow the value; TypeScript suppression comments ({{directive}}) are not allowed.',
      eslintSuppression:
        'Fix the violation; inline ESLint disables are not allowed. A reviewed exception belongs in the nitpicker config file.',
      comment:
        'Remove the comment and put the intent in code: a descriptive identifier, a named function, or a type. Only non-suppression tool directives may be comments.',
      internalDocComment:
        'Doc comments are allowed only on exported declarations and the members of exported types. Remove this one and put the intent in code: a descriptive identifier, a named function, or a type.',
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const problem = commentProblem(context.sourceCode, comment);
          if (problem) context.report({ loc: comment.loc, ...problem });
        }
      },
    };
  },
};
