import type {
  FixRecipe,
  RecipeEdit,
  RecipeFix,
  RecipeSource,
} from '../../../../../../core/fix/typed/fix-types.mts';

type Replace = Extract<RecipeEdit, { type: 'replace' }>;
type MethodOptions = { prefix?: string; modifiers?: string; limit?: string };
export function method(name: string, options: MethodOptions = {}): string {
  const { prefix = 'top:', modifiers = '', limit = 'limit' } = options;
  return `    ${modifiers}String ${name}(List<String> selection, int limit) {
        List<String> selected = new ArrayList<>();
        for (String element : selection) {
            if (element.length() < ${limit}) {
                selected.add(element);
            }
        }
        String label = String.join(",", selected);
        return (label.length() > 0 ? "${prefix}" : "none:") + label;
    }
`;
}

export function classOf(...members: readonly string[]): string {
  return `package demo;\n\nimport java.util.ArrayList;\nimport java.util.List;\n\nclass Align {\n${members.join('\n')}}\n`;
}

function isReplace(edit: RecipeEdit): edit is Replace {
  return edit.type === 'replace';
}

export function applied(text: string, edits: readonly RecipeEdit[]): string {
  const ascending = edits.filter(isReplace).toSorted((left, right) => left.start - right.start);
  return ascending.reduceRight(
    (result, { start, end, text: replacement }) =>
      `${result.slice(0, start)}${replacement}${result.slice(end)}`,
    text,
  );
}

export function plannedEdits(
  recipe: FixRecipe,
  file: RecipeSource,
): { readonly fixes: readonly RecipeFix[]; readonly notes: readonly string[] } {
  const { fixes, notes = [] } = recipe.plan({ files: [file], projectRoot: '/nonexistent' });
  return { fixes, notes };
}

export function appliedPlan(
  recipe: FixRecipe,
  file: RecipeSource,
): ReturnType<typeof plannedEdits> & { readonly after: string } {
  const { fixes, notes } = plannedEdits(recipe, file);
  return {
    fixes,
    notes,
    after: applied(
      file.text,
      fixes.flatMap(({ edits }) => edits),
    ),
  };
}
