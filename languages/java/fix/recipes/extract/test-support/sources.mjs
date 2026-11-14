export function method(name, { prefix = 'top:', modifiers = '', limit = 'limit' } = {}) {
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

export function classOf(...members) {
  return `package demo;\n\nimport java.util.ArrayList;\nimport java.util.List;\n\nclass Align {\n${members.join('\n')}}\n`;
}

export function applied(text, edits) {
  return [...edits]
    .toSorted((left, right) => right.start - left.start)
    .reduce(
      (result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end),
      text,
    );
}
