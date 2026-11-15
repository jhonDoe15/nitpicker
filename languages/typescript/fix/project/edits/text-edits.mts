import type TypeScript from 'typescript';
import type { Project, ProjectEdit, ReplaceEdit } from '../typed/project-types.mts';

function isReplaceEdit(edit: ProjectEdit): edit is ReplaceEdit {
  return edit.type === 'replace' && 'start' in edit;
}

export function replaceEdit(
  path: string,
  [start, end]: readonly [number, number],
  text: string,
): ReplaceEdit {
  return { type: 'replace', path, start, end, text };
}

export function composed(text: string, edits: readonly ProjectEdit[]): string {
  return edits
    .filter(isReplaceEdit)
    .toSorted((left, right) => right.start - left.start)
    .reduce(
      (result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end),
      text,
    );
}

export function fileEdits(edits: readonly ProjectEdit[], path: string): ProjectEdit[] {
  return edits.filter((edit) => 'path' in edit && edit.path === path);
}

export function changesToEdits(
  project: Project,
  changes: readonly TypeScript.FileTextChanges[],
  accepts: (name: string) => boolean,
): ReplaceEdit[] | undefined {
  const edits: ReplaceEdit[] = [];
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

export function declined(reason: string): { readonly declined: string } {
  return { declined: reason };
}
