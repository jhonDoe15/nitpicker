import { existsSync } from 'node:fs';
import path from 'node:path';
import { ts } from '../../../typescript-api/typescript-api.mjs';
import { fileReferenceProblem } from './declines.mjs';
import { changesToEdits, composed, declined, fileEdits } from './text-edits.mjs';
import { verifyMove } from './verify-edits.mjs';

const FORMAT = ts.getDefaultFormatCodeSettings();

function moveEdits(project, { from, to, edits }) {
  const own = fileEdits(edits, from);
  const others = edits.filter((edit) => edit.path !== from);
  if (own.length === 0) {
    return [...others, { type: 'move', from, to }];
  }
  const text = composed(project.read(from), own);
  return [...others, { type: 'delete', path: from }, { type: 'write', path: to, text }];
}

function targetProblem(context, project, { from, to }) {
  if (from === to) {
    return 'the file is already there';
  }
  const target = path.resolve(context.projectRoot, to);
  if (path.relative(context.projectRoot, target).startsWith('..') || !context.accepts(to)) {
    return `${to} is outside the files --fix covers`;
  }
  return project.read(to) !== undefined || existsSync(target) ? `${to} is taken` : undefined;
}

export function planFileMove(context, project, { from, to }) {
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
