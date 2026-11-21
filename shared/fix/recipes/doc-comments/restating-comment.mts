import { docCommentProblem } from '../../../rules/doc-comments/doc-comments.mts';
import { fieldOf } from '../../../values/readers.mts';

type Span = { readonly start: number; readonly end: number };
type Comment = Parameters<typeof docCommentProblem>[0];

export const DOC_COMMENT_RULE = 'doc-comment-content';

export function lineStartOf(text: string, offset: number): number {
  return offset === 0 ? 0 : text.lastIndexOf('\n', offset - 1) + 1;
}

function lineEndOf(text: string, offset: number): number {
  const newline = text.indexOf('\n', offset);
  return newline === -1 ? text.length : newline + 1;
}

export function wholeLines(text: string, { start, end }: Span): Span | undefined {
  const first = lineStartOf(text, start);
  const last = lineEndOf(text, end);
  const alone = text.slice(first, start).trim() === '' && text.slice(end, last).trim() === '';
  return alone ? { start: first, end: last } : undefined;
}

export function restatesItsName(comment: Comment): boolean {
  return docCommentProblem(comment)?.kind === 'restating';
}

export function deletionFix<Finding>({
  finding,
  path,
  text,
  span,
}: {
  readonly finding: Finding;
  readonly path: string;
  readonly text: string;
  readonly span: Span;
}): {
  finding: Finding;
  edits: { type: 'replace'; path: string; start: number; end: number; text: string }[];
}[] {
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

export function isCovered(inputs: unknown, name: string): boolean {
  const isExcepted = fieldOf(inputs, 'isExcepted');
  return (
    typeof isExcepted !== 'function' ||
    Reflect.apply(isExcepted, inputs, [DOC_COMMENT_RULE, name]) !== true
  );
}
