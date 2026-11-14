import { removalRange, replacing } from '../support/ranges.mjs';

const WORD = /[\w$]/u;
const OPERATOR = /[-+*/%<>=!&|^?.:]/u;
const OPENING = /[([{\s]/u;
const NEWLINE = /[\n\r\u2028\u2029]/u;

function insideJsx(sourceCode, comment) {
  const node = sourceCode.getNodeByRangeIndex(comment.range[0]);
  return node?.type === 'JSXExpressionContainer' || node?.type === 'JSXEmptyExpression';
}

function wouldJoin(left, right) {
  return (WORD.test(left) && WORD.test(right)) || (OPERATOR.test(left) && OPERATOR.test(right));
}

function inlineRemoval(text, comment) {
  const [start, end] = comment.range;
  const before = text[start - 1];
  const after = text[end];
  if (before !== undefined && after !== undefined && wouldJoin(before, after)) {
    return replacing([start, end], ' ');
  }
  if (before === undefined || OPENING.test(before)) {
    const spaces = /^[ \t]*/u.exec(text.slice(end))[0].length;
    return replacing([start, end + spaces], '');
  }
  return replacing([start, end], '');
}

export function commentRemoval(sourceCode, comment) {
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
    const padding = /[ \t]*$/u.exec(text.slice(0, comment.range[0]))[0].length;
    return replacing([comment.range[0] - padding, comment.range[1]], '');
  }
  return NEWLINE.test(comment.value) ? undefined : inlineRemoval(text, comment);
}
