import {
  descriptionLines,
  docCommentProblem,
  tagsHaveContent,
} from '../../../../../../shared/rules/doc-comments/doc-comments.mjs';

const MEMBER_TYPES = new Set(['TSPropertySignature', 'TSMethodSignature']);
const EXPORT_DECLARATIONS = new Set(['ExportNamedDeclaration', 'ExportDefaultDeclaration']);
const JSDOC = { blockTag: /^@[A-Za-z][\w-]*(?=[\s{]|$)/u, marker: /^\s*\*+/u };
const MESSAGE_IDS = { restating: 'restatingDocComment', long: 'longDocComment' };

function keyName(key) {
  if (key?.type === 'Identifier') return key.name;
  return key?.type === 'Literal' && typeof key.value === 'string' ? key.value : undefined;
}

function declaredName(node) {
  if (MEMBER_TYPES.has(node.type)) return keyName(node.key);
  const { declaration } = node;
  if (declaration?.type !== 'VariableDeclaration') return declaration?.id?.name;
  const [declarator] = declaration.declarations;
  return declaration.declarations.length === 1 && declarator.id.type === 'Identifier'
    ? declarator.id.name
    : undefined;
}

export function docCommentContentReports(comment, node) {
  const problem = docCommentProblem({
    name: declaredName(node),
    lines: descriptionLines(comment.value, JSDOC),
    detailed: tagsHaveContent(comment.value, JSDOC),
  });
  if (problem === undefined) {
    return [];
  }
  const { kind, ...data } = problem;
  return [{ messageId: MESSAGE_IDS[kind], data }];
}

function declarationStartingAt(sourceCode, token) {
  const innermost = sourceCode.getNodeByRangeIndex(token.range[0]);
  if (!innermost) {
    return undefined;
  }
  return [...sourceCode.getAncestors(innermost), innermost].find(
    (node) => node.type !== 'Program' && node.range[0] === token.range[0],
  );
}

function isExportedTypeMember(node) {
  if (!MEMBER_TYPES.has(node.type)) {
    return false;
  }
  const typeLiteral = node.parent;
  const alias = typeLiteral?.parent;
  return (
    typeLiteral?.type === 'TSTypeLiteral' &&
    alias?.type === 'TSTypeAliasDeclaration' &&
    EXPORT_DECLARATIONS.has(alias.parent?.type)
  );
}

export function publicApiNode(sourceCode, comment) {
  const token = sourceCode.getTokenAfter(comment);
  if (!token) {
    return undefined;
  }
  const node = declarationStartingAt(sourceCode, token);
  if (!node) {
    return undefined;
  }
  return EXPORT_DECLARATIONS.has(node.type) || isExportedTypeMember(node) ? node : undefined;
}
