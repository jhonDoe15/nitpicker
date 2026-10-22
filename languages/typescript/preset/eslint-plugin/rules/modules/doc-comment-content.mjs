import {
  descriptionLines,
  docCommentProblem,
} from '../../../../../../shared/rules/doc-comments/doc-comments.mjs';

const MEMBER_TYPES = new Set(['TSPropertySignature', 'TSMethodSignature']);
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
  });
  if (problem === undefined) {
    return [];
  }
  const { kind, ...data } = problem;
  return [{ messageId: MESSAGE_IDS[kind], data }];
}
