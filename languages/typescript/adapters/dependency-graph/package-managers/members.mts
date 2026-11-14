import { existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { projectFilePaths } from '../typed/outside-views.mts';
import { containedPath } from './contained-path.mts';

const DEPENDENCY_DIRECTORY = 'node_modules';

export function manifestDirectories(root: string): string[] {
  return projectFilePaths(root)
    .filter((file) => path.basename(file) === 'package.json')
    .map((file) => path.dirname(file))
    .filter(
      (directory) => directory !== '.' && !directory.split('/').includes(DEPENDENCY_DIRECTORY),
    );
}

function isRealDirectory(candidate: string): boolean {
  return existsSync(candidate) && lstatSync(candidate).isDirectory();
}

export function memberDependencyDirectories(root: string): string[] {
  return [...new Set(manifestDirectories(root))]
    .map((directory) => path.join(directory, DEPENDENCY_DIRECTORY))
    .filter((relative) => isRealDirectory(containedPath(root, relative)));
}
