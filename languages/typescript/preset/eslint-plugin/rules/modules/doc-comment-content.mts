import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { hasKind } from '../../../syntax/kinds/node-kinds.mts';
import {
  descriptionLines as untypedDescriptionLines,
  docCommentProblem as untypedDocCommentProblem,
  tagsHaveContent as untypedTagsHaveContent,
} from '../../../../../../shared/rules/doc-comments/doc-comments.mjs';

type MessageId = 'restatingDocComment' | 'longDocComment';
type DocCommentReport = {
  readonly messageId: MessageId;
  readonly data: Readonly<Record<string, unknown>>;
};
type Problem = { readonly kind: string; readonly [field: string]: unknown };
type JsdocPatterns = { readonly blockTag: RegExp; readonly marker: RegExp };
export type CommentSource = {
  readonly getTokenAfter: (comment: TSESTree.Comment) => TSESTree.Token | undefined;
  readonly getNodeByRangeIndex: (index: number) => TSESTree.Node | undefined;
  readonly getAncestors: (node: TSESTree.Node) => TSESTree.Node[];
};
type Member = TSESTree.TSPropertySignature | TSESTree.TSMethodSignature;

const descriptionLines: (text: string, patterns: JsdocPatterns) => string[] =
  untypedDescriptionLines;
const tagsHaveContent: (text: string, patterns: JsdocPatterns) => boolean = untypedTagsHaveContent;
const docCommentProblem: (input: {
  readonly name: string | undefined;
  readonly lines: readonly string[];
  readonly detailed: boolean;
}) => Problem | undefined = untypedDocCommentProblem;

const MEMBER_TYPES = new Set<string>(['TSPropertySignature', 'TSMethodSignature']);
const EXPORT_DECLARATIONS = new Set<string>(['ExportNamedDeclaration', 'ExportDefaultDeclaration']);
const JSDOC = { blockTag: /^@[A-Za-z][\w-]*(?=[\s{]|$)/u, marker: /^\s*\*+/u };
function keyName(key: TSESTree.Node | undefined): string | undefined {
  if (hasKind(key, 'Identifier')) {
    return key.name;
  }
  return hasKind(key, 'Literal') && typeof key.value === 'string' ? key.value : undefined;
}

function isMember(node: TSESTree.Node): node is Member {
  return MEMBER_TYPES.has(node.type);
}

function declaredName(node: TSESTree.Node): string | undefined {
  if (isMember(node)) {
    return keyName(node.key);
  }
  const declaration =
    hasKind(node, 'ExportNamedDeclaration') || hasKind(node, 'ExportDefaultDeclaration')
      ? node.declaration
      : undefined;
  if (!hasKind(declaration, 'VariableDeclaration')) {
    return declaration !== undefined &&
      declaration !== null &&
      'id' in declaration &&
      declaration.id !== null &&
      'name' in declaration.id
      ? declaration.id.name
      : undefined;
  }
  const [declarator] = declaration.declarations;
  return declaration.declarations.length === 1 && hasKind(declarator.id, 'Identifier')
    ? declarator.id.name
    : undefined;
}

export function docCommentContentReports(
  comment: TSESTree.Comment,
  node: TSESTree.Node,
): DocCommentReport[] {
  const problem = docCommentProblem({
    name: declaredName(node),
    lines: descriptionLines(comment.value, JSDOC),
    detailed: tagsHaveContent(comment.value, JSDOC),
  });
  if (problem === undefined) {
    return [];
  }
  const { kind, ...data } = problem;
  return [{ messageId: kind === 'restating' ? 'restatingDocComment' : 'longDocComment', data }];
}

function declarationStartingAt(
  sourceCode: CommentSource,
  token: TSESTree.Token,
): TSESTree.Node | undefined {
  const innermost = sourceCode.getNodeByRangeIndex(token.range[0]);
  if (innermost === undefined) {
    return undefined;
  }
  return [...sourceCode.getAncestors(innermost), innermost].find(
    (node) => !hasKind(node, 'Program') && node.range[0] === token.range[0],
  );
}

function isExportedTypeMember(node: TSESTree.Node): boolean {
  if (!isMember(node)) {
    return false;
  }
  const typeLiteral = node.parent;
  const alias = typeLiteral.parent;
  return (
    hasKind(typeLiteral, 'TSTypeLiteral') &&
    hasKind(alias, 'TSTypeAliasDeclaration') &&
    EXPORT_DECLARATIONS.has(alias.parent.type)
  );
}

export function publicApiNode(
  sourceCode: CommentSource,
  comment: TSESTree.Comment,
): TSESTree.Node | undefined {
  const token = sourceCode.getTokenAfter(comment);
  if (token === undefined) {
    return undefined;
  }
  const node = declarationStartingAt(sourceCode, token);
  if (!node) {
    return undefined;
  }
  return EXPORT_DECLARATIONS.has(node.type) || isExportedTypeMember(node) ? node : undefined;
}

export function commentSource(sourceCode: Readonly<TSESLint.SourceCode>): CommentSource {
  return {
    getTokenAfter: (comment) => sourceCode.getTokenAfter(comment) ?? undefined,
    getNodeByRangeIndex: (index) => sourceCode.getNodeByRangeIndex(index) ?? undefined,
    getAncestors: (node) => sourceCode.getAncestors(node),
  };
}
