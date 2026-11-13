import { collectProjectFiles } from '../../../../core/fix/all-files/project-files.mjs';
import { createSnapshot } from '../../../../core/fix/engine/edits/snapshot.mjs';

const PYTHON_FILE = /\.py$/u;

export function projectSources(projectRoot, files) {
  const known = new Set(files.map(({ path: name }) => name));
  const { files: listed } = collectProjectFiles({
    projectRoot,
    accepts: (name) => PYTHON_FILE.test(name) && !known.has(name),
    scope: undefined,
  });
  return createSnapshot(
    projectRoot,
    listed.map(({ path: name }) => name),
  ).files;
}
