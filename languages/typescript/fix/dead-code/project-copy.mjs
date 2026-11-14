import { copyFileSync, existsSync, mkdirSync, realpathSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from '../../../../core/fix/common/contained-path.mjs';
import { projectFilesUnder } from '../../../../shared/project-files/project-files.mjs';

const DEPENDENCY_DIRECTORY = 'node_modules';

function linkDependencies(projectRoot, target, directories) {
  for (const directory of directories) {
    const source = containedPath(projectRoot, `${directory}/${DEPENDENCY_DIRECTORY}`);
    if (existsSync(source)) {
      const link = containedPath(target, `${directory}/${DEPENDENCY_DIRECTORY}`);
      mkdirSync(path.dirname(link), { recursive: true });
      symlinkSync(realpathSync(source), link, 'dir');
    }
  }
}

function isDependencyDirectory(_absolute, entry) {
  return entry.name === DEPENDENCY_DIRECTORY;
}

export function copyProject(projectRoot, target) {
  const directories = new Set(['.']);
  const skipDirectory = isDependencyDirectory;
  for (const file of projectFilesUnder(projectRoot, { skipDirectory })) {
    const relative = path.relative(projectRoot, file);
    const copy = containedPath(target, relative);
    mkdirSync(path.dirname(copy), { recursive: true });
    copyFileSync(file, copy);
    directories.add(path.dirname(relative));
  }
  linkDependencies(projectRoot, target, directories);
}
