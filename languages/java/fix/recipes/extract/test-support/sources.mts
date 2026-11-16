import type { RecipeEdit } from '../../../../../../core/fix/typed/fix-types.mts';

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

export function applied(text: string, edits: readonly RecipeEdit[]): string {
  return edits
    .filter((edit): edit is Replace => edit.type === 'replace')
    .toSorted((left, right) => right.start - left.start)
    .reduce(
      (result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end),
      text,
    );
}
