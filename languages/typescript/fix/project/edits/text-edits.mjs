export function replaceEdit(path, [start, end], text) {
  return { type: 'replace', path, start, end, text };
}

export function composed(text, edits) {
  return [...edits]
    .toSorted((left, right) => right.start - left.start)
    .reduce(
      (result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end),
      text,
    );
}

export function fileEdits(edits, path) {
  return edits.filter((edit) => edit.path === path);
}

export function changesToEdits(project, changes, accepts) {
  const edits = [];
  for (const change of changes) {
    const path = project.nameOf(change.fileName);
    if (path === undefined || !project.has(path) || !accepts(path)) {
      return undefined;
    }
    project.read(path);
    for (const { span, newText } of change.textChanges) {
      edits.push(replaceEdit(path, [span.start, span.start + span.length], newText));
    }
  }
  return edits;
}

export function declined(reason) {
  return { declined: reason };
}
