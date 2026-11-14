import { existsSync } from 'node:fs';
import path from 'node:path';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import type { FixContext, Planned, Project, ProjectEdit } from '../typed/project-types.mts';
import { fileReferenceProblem } from './declines.mts';
import { changesToEdits, composed, declined, fileEdits } from './text-edits.mts';
import { verifyMove } from './verify-edits.mts';

const ts = typescriptApi();
const FORMAT = ts.getDefaultFormatCodeSettings();

type Move = { readonly from: string; readonly to: string };

function moveEdits(
  project: Project,
  { from, to, edits }: Move & { readonly edits: readonly ProjectEdit[] },
): ProjectEdit[] {
  const own = fileEdits(edits, from);
  const others = edits.filter((edit) => !('path' in edit) || edit.path !== from);
  if (own.length === 0) {
    return [...others, { type: 'move', from, to }];
  }
  const text = composed(project.read(from) ?? '', own);
  return [...others, { type: 'delete', path: from }, { type: 'write', path: to, text }];
}

function targetProblem(
  context: FixContext,
  project: Project,
  { from, to }: Move,
): string | undefined {
  if (from === to) {
    return 'the file is already there';
  }
  const target = path.resolve(context.projectRoot, to);
  if (path.relative(context.projectRoot, target).startsWith('..') || !context.accepts(to)) {
    return `${to} is outside the files --fix covers`;
  }
  return project.read(to) !== undefined || existsSync(target) ? `${to} is taken` : undefined;
}

export function planFileMove(context: FixContext, project: Project, { from, to }: Move): Planned {
  const taken = targetProblem(context, project, { from, to });
  const problem = taken ?? fileReferenceProblem(project, from);
  if (problem !== undefined) {
    return declined(problem);
  }
  const changes = project.service.getEditsForFileRename(
    project.absolute(from),
    project.absolute(to),
    FORMAT,
    {},
  );
  const edits = changesToEdits(project, changes, context.accepts);
  if (edits === undefined) {
    return declined('an importer sits in a file --fix does not cover');
  }
  const all = moveEdits(project, { from, to, edits });
  const unsafe = verifyMove(context, project, { edits: all, renames: [{ from, to }] });
  return unsafe === undefined ? { edits: all } : declined(unsafe);
}
