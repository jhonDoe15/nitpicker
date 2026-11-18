import type { TSESTree } from '@typescript-eslint/utils';
import type { TextEdit } from '../../edits/text.mts';

export function applyEdits(
  source: string,
  range: TSESTree.Range,
  edits: readonly TextEdit[],
): string {
  let text = source.slice(range[0], range[1]);
  const ordered = edits.toSorted((left, right) => right.range[0] - left.range[0]);
  for (const edit of ordered) {
    text =
      text.slice(0, edit.range[0] - range[0]) + edit.text + text.slice(edit.range[1] - range[0]);
  }
  return text;
}
