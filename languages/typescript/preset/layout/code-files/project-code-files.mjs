import { existsSync } from 'node:fs';
import path from 'node:path';
import { filesUnder } from '../../../../../shared/filesystem.mjs';
export const DEPENDENCY_PATH_PATTERN = '(?:^|/)node_modules(?:/|$)';
const DEPENDENCY_PATH = new RegExp(DEPENDENCY_PATH_PATTERN);

export function codeFilesUnder(layout, projectRoot, roots) {
  return roots.flatMap((root) => codeFilesUnderRoot(layout, projectRoot, root).toSorted());
}

function codeFilesUnderRoot(layout, projectRoot, root) {
  function relativeOf(absolute) {
    return path.relative(projectRoot, absolute).replaceAll('\\', '/');
  }
  const directory = directoryUnder(projectRoot, root);
  return [
    ...filesUnder(directory, {
      skipDirectory: (absolute) => DEPENDENCY_PATH.test(relativeOf(absolute)),
    }),
  ]
    .map(relativeOf)
    .filter((name) => !layout.isGeneratedPath(name) && isCodeFile(layout, name));
}

function isCodeFile(layout, name) {
  return (layout.isSourceFile(name) || layout.isTestFile(name)) && !layout.isExcluded(name);
}

function directoryUnder(projectRoot, root) {
  const projectDirectory = path.resolve(projectRoot);
  const directory = path.resolve(projectDirectory, root);
  if (directory !== projectDirectory && !directory.startsWith(`${projectDirectory}${path.sep}`)) {
    throw new Error(`Source root is outside the project: ${root}`);
  }
  return directory;
}

export function existingRoots(projectRoot, roots) {
  return roots.filter((root) => existsSync(directoryUnder(projectRoot, root)));
}
