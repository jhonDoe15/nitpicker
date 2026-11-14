import { docCommentProblem } from '../../../rules/doc-comments/doc-comments.mjs';

export const DOC_COMMENT_RULE = 'doc-comment-content';

export function lineStartOf(text, offset) {
  return offset === 0 ? 0 : text.lastIndexOf('\n', offset - 1) + 1;
}

function lineEndOf(text, offset) {
  const newline = text.indexOf('\n', offset);
  return newline === -1 ? text.length : newline + 1;
}

export function wholeLines(text, { start, end }) {
  const first = lineStartOf(text, start);
  const last = lineEndOf(text, end);
  const alone = text.slice(first, start).trim() === '' && text.slice(end, last).trim() === '';
  return alone ? { start: first, end: last } : undefined;
}

export function restatesItsName(comment) {
  return docCommentProblem(comment)?.kind === 'restating';
}

export function deletionFix({ finding, path, text, span }) {
  const lines = wholeLines(text, span);
  return lines === undefined
    ? []
    : [
        {
          finding,
          edits: [{ type: 'replace', path, start: lines.start, end: lines.end, text: '' }],
        },
      ];
}

export function isCovered(inputs, name) {
  return inputs.isExcepted?.(DOC_COMMENT_RULE, name) !== true;
}
