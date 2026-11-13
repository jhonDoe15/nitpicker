import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

function readFromDisk(projectRoot) {
  return (name) => {
    const file = path.resolve(projectRoot, name);
    if (path.relative(projectRoot, file).startsWith('..')) {
      return undefined;
    }
    return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  };
}

export function guardDeletions(projectRoot, planned) {
  const deletions = planned.filter(({ deleted }) => deleted === true);
  if (deletions.length === 0) {
    return { planned, notes: [] };
  }
  const { withProject } = require('../model/project-model.mjs');
  const { fileReferenceProblem } = require('../edits/declines.mjs');
  const problems = withProject(
    {
      projectRoot,
      files: deletions.map(({ name }) => ({ path: name })),
      read: readFromDisk(projectRoot),
    },
    (project) => new Map(deletions.map(({ name }) => [name, fileReferenceProblem(project, name)])),
  );
  return {
    planned: planned.filter(({ name }) => problems.get(name) === undefined),
    notes: [...problems]
      .filter(([, problem]) => problem !== undefined)
      .map(([name, problem]) => `--fix kept ${name}, which knip reports unused: ${problem}`),
  };
}
