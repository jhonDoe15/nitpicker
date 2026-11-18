import type { coreRuleRecipe } from '../core-rule-recipe.mts';

type Recipe = ReturnType<typeof coreRuleRecipe>;

export function applied(
  recipe: Recipe,
  text: string,
  name = 'src/main/sample.ts',
): { readonly text: string; readonly notes: readonly string[] } {
  const { fixes, notes } = recipe.plan({ files: [{ path: name, text }], inputs: {} });
  const edits = fixes
    .flatMap(({ edits: each }) => each)
    .toSorted((left, right) => right.start - left.start);
  let result = text;
  for (const edit of edits) {
    result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`;
  }
  return { text: result, notes };
}
