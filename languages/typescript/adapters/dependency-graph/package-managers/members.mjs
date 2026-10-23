import { existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { gitProjectFiles } from '../../../../../shared/project-files/project-files.mjs';
import { containedPath } from './contained-path.mjs';

const DEPENDENCY_DIRECTORY = 'node_modules';

function manifestDirectories(root) {
  return (gitProjectFiles(root, ['*package.json']) ?? [])
    .filter((file) => path.basename(file) === 'package.json')
    .map((file) => path.dirname(file))
    .filter(
      (directory) => directory !== '.' && !directory.split('/').includes(DEPENDENCY_DIRECTORY),
    );
}

function isRealDirectory(candidate) {
  return existsSync(candidate) && lstatSync(candidate).isDirectory();
}

export function memberDependencyDirectories(root) {
  return [...new Set(manifestDirectories(root))]
    .map((directory) => path.join(directory, DEPENDENCY_DIRECTORY))
    .filter((relative) => isRealDirectory(containedPath(root, relative)));
}
