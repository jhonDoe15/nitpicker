import { isUtf8 } from 'node:buffer';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { globMatcher } from '../../../shared/paths/glob.mjs';
import { collectWorkingTreeChanges } from '../changes.mjs';
import { containedPath } from './contained-path.mjs';

export function excludedBy(globs = []) {
  const matchers = globs.map(globMatcher);
  return (file) => matchers.some((matcher) => matcher.test(file));
}

export function collectFixFiles({ repositoryRoot, projectRoot, baseRef, accepts }) {
  const { comparison, changes } = collectWorkingTreeChanges({
    repositoryRoot,
    projectRoot,
    baseRef,
  });
  return {
    comparison,
    files: changes.filter(({ isFile, path: name }) => isFile && accepts(name)),
    links: changes
      .filter(({ isFile, path: name }) => !isFile && isLink(projectRoot, name) && accepts(name))
      .map(({ path: name }) => name),
  };
}

function isLink(projectRoot, name) {
  const stats = lstatSync(containedPath(projectRoot, name), { throwIfNoEntry: false });
  return stats?.isSymbolicLink() === true;
}

export function readBytes(projectRoot, files) {
  return new Map(
    files.map(({ path: name }) => [name, readFileSync(containedPath(projectRoot, name))]),
  );
}

function isRewritten(projectRoot, name, before) {
  const file = containedPath(projectRoot, name);
  return existsSync(file) && !before.get(name).equals(readFileSync(file));
}

export function rewrittenPaths(projectRoot, files, before) {
  return files
    .filter(({ path: name }) => isRewritten(projectRoot, name, before))
    .map(({ path: name }) => name);
}

export function rewrittenBy(projectRoot, files, action) {
  const before = readBytes(projectRoot, files);
  action();
  return rewrittenPaths(projectRoot, files, before);
}

export function splitByEncoding(projectRoot, files) {
  const bytes = readBytes(projectRoot, files);
  return {
    files: files.filter(({ path: name }) => isUtf8(bytes.get(name))),
    undecodable: files
      .filter(({ path: name }) => !isUtf8(bytes.get(name)))
      .map(({ path: name }) => name),
  };
}
