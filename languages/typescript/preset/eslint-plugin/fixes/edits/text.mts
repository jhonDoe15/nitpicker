import type { TSESTree } from '@typescript-eslint/utils';

export type TextEdit = { readonly range: TSESTree.Range; readonly text: string };

export function rewritten(
  source: string,
  region: TSESTree.Range,
  edits: readonly TextEdit[],
): string | undefined {
  const ordered = edits.toSorted((first, second) => first.range[0] - second.range[0]);
  const inside = ordered.every(
    ({ range }) => range[0] >= region[0] && range[1] <= region[1] && range[0] <= range[1],
  );
  const separate = ordered.every(
    ({ range }, index) => index === 0 || (ordered[index - 1]?.range[1] ?? 0) <= range[0],
  );
  if (!inside || !separate) {
    return undefined;
  }
  let cursor = region[0];
  let text = '';
  for (const { range, text: replacement } of ordered) {
    text += source.slice(cursor, range[0]) + replacement;
    cursor = range[1];
  }
  return text + source.slice(cursor, region[1]);
}
