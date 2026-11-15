import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';

export type FixPlan = (fixer: TSESLint.RuleFixer) => TSESLint.RuleFix;

export type ReportFix = TSESLint.ReportFixFunction;

export function hasCommentIn(sourceCode: SourceCode, range: TSESTree.Range): boolean {
  return sourceCode
    .getAllComments()
    .some((comment) => comment.range[0] < range[1] && range[0] < comment.range[1]);
}

export function replacing(range: TSESTree.Range, text: string): FixPlan {
  return (fixer) => fixer.replaceTextRange(range, text);
}

export function inserting(index: number, text: string): FixPlan {
  return replacing([index, index], text);
}

export function removalRange(text: string, range: TSESTree.Range): TSESTree.Range {
  const lineStart = text.lastIndexOf('\n', range[0] - 1) + 1;
  const newline = text.indexOf('\n', range[1]);
  const lineEnd = newline === -1 ? text.length : newline;
  const aloneOnLine =
    /^\s*$/u.test(text.slice(lineStart, range[0])) && /^\s*$/u.test(text.slice(range[1], lineEnd));
  if (aloneOnLine) {
    return [lineStart, newline === -1 ? text.length : newline + 1];
  }
  return range;
}

export function removingStatement(
  sourceCode: SourceCode,
  statement: TSESTree.Node,
): FixPlan | undefined {
  if (hasCommentIn(sourceCode, statement.range)) {
    return undefined;
  }
  return replacing(removalRange(sourceCode.text, statement.range), '');
}
