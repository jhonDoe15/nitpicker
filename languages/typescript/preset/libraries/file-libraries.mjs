import path from 'node:path';
import { analyzedProjectRoot, readManifest } from '../eslint-config/scope-support.mjs';
import { manifestLibraries, mergeLibraries } from './project-libraries.mjs';

const manifestsByDirectory = new Map();

function directoryLibraries(directory) {
  if (!manifestsByDirectory.has(directory)) {
    manifestsByDirectory.set(directory, manifestLibraries(readManifest(directory)));
  }
  return manifestsByDirectory.get(directory);
}

function directoriesToRoot(filename, projectRoot) {
  if (typeof filename !== 'string' || !path.isAbsolute(filename)) {
    return [];
  }
  const root = path.resolve(projectRoot);
  const relative = path.relative(root, path.dirname(filename));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return [];
  }
  const segments = relative === '' ? [] : relative.split(path.sep);
  return [
    root,
    ...segments.map((_, index) => path.join(root, ...segments.slice(0, index + 1))),
  ].reverse();
}

export function librariesForFile(filename, fallback, projectRoot = analyzedProjectRoot()) {
  const directories = directoriesToRoot(filename, projectRoot);
  return directories.length === 0
    ? fallback
    : mergeLibraries(directories.map((directory) => directoryLibraries(directory)));
}
