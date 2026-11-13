import { composed } from './text-edits.mjs';
import { createProject } from '../model/project-model.mjs';
import { projectGraph } from '../model/project-graph.mjs';

function overlayOf(context, edits, moves) {
  const texts = new Map();
  const byPath = Map.groupBy(
    edits.filter(({ type }) => type === 'replace'),
    ({ path }) => path,
  );
  for (const [name, list] of byPath) {
    texts.set(name, composed(context.read(name), list));
  }
  for (const edit of edits) {
    if (edit.type === 'write') {
      texts.set(edit.path, edit.text);
    } else if (edit.type === 'delete') {
      texts.set(edit.path, undefined);
    } else if (edit.type === 'move') {
      texts.set(edit.to, context.read(edit.from));
      texts.set(edit.from, undefined);
      moves.set(edit.to, edit.from);
    }
  }
  return texts;
}

function errorCount(project, name) {
  if (!project.has(name)) {
    return 0;
  }
  const file = project.absolute(name);
  return (
    project.service.getSyntacticDiagnostics(file).length +
    project.service.getSemanticDiagnostics(file).length
  );
}

function withImporters(project, names) {
  const importers = new Map();
  for (const { source, dependencies } of projectGraph(project).modules) {
    for (const { resolved } of dependencies) {
      importers.set(resolved, [...(importers.get(resolved) ?? []), source]);
    }
  }
  const covered = new Set(names);
  for (const name of covered) {
    for (const importer of importers.get(name) ?? []) {
      covered.add(importer);
    }
  }
  return [...covered];
}

export function verifyMove(context, project, { edits, renames }) {
  const moves = new Map(renames.map(({ from, to }) => [to, from]));
  const texts = overlayOf(context, edits, moves);
  const written = [...texts].filter(([, text]) => text !== undefined).map(([name]) => name);
  const after = createProject({
    projectRoot: context.projectRoot,
    files: [...context.files, ...written.map((name) => ({ path: name }))],
    read: (name) => (texts.has(name) ? texts.get(name) : context.read(name)),
    javascript: context.inputs?.layout?.javascript === true,
  });
  try {
    const worse = withImporters(after, written).find(
      (name) => errorCount(after, name) > errorCount(project, moves.get(name) ?? name),
    );
    return worse === undefined ? undefined : `the change would add errors to ${worse}`;
  } finally {
    after.dispose();
  }
}

export function verifyEdits(context, project, edits) {
  return verifyMove(context, project, { edits, renames: [] });
}
