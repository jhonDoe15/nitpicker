import { copyFileSync, existsSync, mkdirSync, realpathSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { projectFilesUnder } from '../../adapters/typed/tooling.mts';
import { containedPath } from '../typed/fix-views.mts';

const DEPENDENCY_DIRECTORY = 'node_modules';

function linkDependencies(
  projectRoot: string,
  target: string,
  directories: ReadonlySet<string>,
): void {
  for (const directory of directories) {
    const source = containedPath(projectRoot, `${directory}/${DEPENDENCY_DIRECTORY}`);
    if (existsSync(source)) {
      const link = containedPath(target, `${directory}/${DEPENDENCY_DIRECTORY}`);
      mkdirSync(path.dirname(link), { recursive: true });
      symlinkSync(realpathSync(source), link, 'dir');
    }
  }
}

function isDependencyDirectory(_absolute: string, entry: { readonly name: string }): boolean {
  return entry.name === DEPENDENCY_DIRECTORY;
}

export function copyProject(projectRoot: string, target: string): void {
  const directories = new Set(['.']);
  const skipDirectory = isDependencyDirectory;
  for (const file of projectFilesUnder(projectRoot, { includeIgnored: false, skipDirectory })) {
    const relative = path.relative(projectRoot, file);
    const copy = containedPath(target, relative);
    mkdirSync(path.dirname(copy), { recursive: true });
    copyFileSync(file, copy);
    directories.add(path.dirname(relative));
  }
  linkDependencies(projectRoot, target, directories);
}
