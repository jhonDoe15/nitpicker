import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { wholeLines } from '../../../../../shared/fix/recipes/doc-comments/restating-comment.mjs';

type SourceCode = TSESLint.SourceCode;

export type TextSpan = { readonly start: number; readonly end: number };

const STATEMENT_LISTS = new Set<string>([
  AST_NODE_TYPES.Program,
  AST_NODE_TYPES.BlockStatement,
  AST_NODE_TYPES.StaticBlock,
  AST_NODE_TYPES.SwitchCase,
]);

export function isInStatementList(node: TSESTree.Node): boolean {
  return node.parent !== undefined && STATEMENT_LISTS.has(node.parent.type);
}

const ownLines: (text: string, span: TextSpan) => TextSpan | undefined = wholeLines;

export function withOwnLines(text: string, span: TextSpan): TextSpan {
  return ownLines(text, span) ?? span;
}

export function hasComment(sourceCode: SourceCode, { start, end }: TextSpan): boolean {
  return sourceCode.getAllComments().some(({ range }) => range[0] < end && range[1] > start);
}
