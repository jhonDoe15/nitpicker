import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from './contained-path.mjs';

const DEPENDENCY_DIRECTORY = 'node_modules';
const MAX_LISTING_BYTES = 64 * 1024 * 1024;

function manifestDirectories(root) {
  const result = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*package.json'],
    { cwd: root, encoding: 'utf8', maxBuffer: MAX_LISTING_BYTES },
  );
  if (result.error !== undefined || result.status !== 0) {
    return [];
  }
  return result.stdout
    .split('\0')
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
