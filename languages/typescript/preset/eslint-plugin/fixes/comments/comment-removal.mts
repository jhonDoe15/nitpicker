import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { removalRange, replacing, type FixPlan } from '../support/ranges.mts';

const WORD = /[\w$]/u;
const OPERATOR = /[-+*/%<>=!&|^?.:]/u;
const OPENING = /[([{\s]/u;
const NEWLINE = /[\n\r\u2028\u2029]/u;

function insideJsx(sourceCode: SourceCode, comment: TSESTree.Comment): boolean {
  const node = sourceCode.getNodeByRangeIndex(comment.range[0]);
  return (
    node?.type === AST_NODE_TYPES.JSXExpressionContainer ||
    node?.type === AST_NODE_TYPES.JSXEmptyExpression
  );
}

function wouldJoin(left: string, right: string): boolean {
  return (WORD.test(left) && WORD.test(right)) || (OPERATOR.test(left) && OPERATOR.test(right));
}

function inlineRemoval(text: string, comment: TSESTree.Comment): FixPlan {
  const [start, end] = comment.range;
  const before = text[start - 1];
  const after = text[end];
  if (before !== undefined && after !== undefined && wouldJoin(before, after)) {
    return replacing([start, end], ' ');
  }
  if (before === undefined || OPENING.test(before)) {
    const spaces = (/^[ \t]*/u.exec(text.slice(end))?.[0] ?? '').length;
    return replacing([start, end + spaces], '');
  }
  return replacing([start, end], '');
}

export function commentRemoval(
  sourceCode: SourceCode,
  comment: TSESTree.Comment,
): FixPlan | undefined {
  const { text } = sourceCode;
  if (insideJsx(sourceCode, comment)) {
    return undefined;
  }
  const whole = removalRange(text, comment.range);
  if (whole !== comment.range) {
    return replacing(whole, '');
  }
  const lineEnd = text.indexOf('\n', comment.range[1]);
  const trailing = /^\s*$/u.test(
    text.slice(comment.range[1], lineEnd === -1 ? text.length : lineEnd),
  );
  if (trailing) {
    const padding = (/[ \t]*$/u.exec(text.slice(0, comment.range[0]))?.[0] ?? '').length;
    return replacing([comment.range[0] - padding, comment.range[1]], '');
  }
  return NEWLINE.test(comment.value) ? undefined : inlineRemoval(text, comment);
}
