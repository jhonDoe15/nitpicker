import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { runGit } from '../../diff/git/repository/command.mjs';

const SKIPPED_SEGMENTS = new Set([
  'node_modules',
  'fixtures',
  'vendor',
  'third_party',
  'test',
  'tests',
  'docs',
  'build',
  'dist',
  'target',
  'out',
]);

export function statInside(root, ...segments) {
  const full = path.resolve(root, ...segments);
  if (!full.startsWith(root + path.sep)) {
    return undefined;
  }
  return existsSync(full) ? statSync(full) : undefined;
}

export function readTextInside(root, ...segments) {
  const full = path.resolve(root, ...segments);
  if (!full.startsWith(root + path.sep)) {
    return '';
  }
  return existsSync(full) ? readFileSync(full, 'utf8') : '';
}

export function listRepositoryFiles(root) {
  return runGit(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    .split('\0')
    .filter(Boolean);
}

function directoryOf(file) {
  return path.posix.dirname(file);
}

export function isInside(directory, parent) {
  return parent === '.' || directory === parent || directory.startsWith(`${parent}/`);
}

export function directoriesWith(root, files, names) {
  return [
    ...new Set(
      files
        .filter((file) => names.includes(path.posix.basename(file)))
        .filter((file) => statInside(root, file) !== undefined)
        .map(directoryOf),
    ),
  ].toSorted();
}

export function isSkippedLocation(directory) {
  return directory
    .split('/')
    .some(
      (segment) => (segment.startsWith('.') && segment !== '.') || SKIPPED_SEGMENTS.has(segment),
    );
}

export function outermost(directories, { rootContainsAll = false } = {}) {
  return directories.filter(
    (directory) =>
      !directories.some(
        (other) =>
          other !== directory && (rootContainsAll || other !== '.') && isInside(directory, other),
      ),
  );
}
