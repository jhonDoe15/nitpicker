import { existsSync, readFileSync, statSync, type Stats } from 'node:fs';
import path from 'node:path';
import { runGit } from '../../diff/git/repository/command.mts';
import { byText } from '../../../shared/text-order/by-text.mts';

const SKIPPED_SEGMENTS = new Set([
  'node_modules',
  'fixture',
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

export function statInside(root: string, ...segments: string[]): Stats | undefined {
  const full = path.resolve(root, ...segments);
  if (!full.startsWith(root + path.sep)) {
    return undefined;
  }
  return existsSync(full) ? statSync(full) : undefined;
}

export function readTextOr<Fallback>(
  root: string,
  segments: readonly string[],
  fallback: Fallback,
): string | Fallback {
  const full = path.resolve(root, ...segments);
  if (!full.startsWith(root + path.sep)) {
    return fallback;
  }
  return existsSync(full) ? readFileSync(full, 'utf8') : fallback;
}

export function readTextInside(root: string, ...segments: string[]): string {
  return readTextOr(root, segments, '');
}

export function listRepositoryFiles(root: string): string[] {
  return runGit(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    .split('\0')
    .filter(Boolean);
}

function directoryOf(file: string): string {
  return path.posix.dirname(file);
}

export function isInside(directory: string, parent: string): boolean {
  return parent === '.' || directory === parent || directory.startsWith(`${parent}/`);
}

export function directoriesWith(
  root: string,
  files: readonly string[],
  names: readonly string[],
): string[] {
  return [
    ...new Set(
      files
        .filter((file) => names.includes(path.posix.basename(file)))
        .filter((file) => statInside(root, file) !== undefined)
        .map(directoryOf),
    ),
  ].toSorted(byText);
}

export function isSkippedLocation(directory: string): boolean {
  return directory
    .split('/')
    .some(
      (segment) => (segment.startsWith('.') && segment !== '.') || SKIPPED_SEGMENTS.has(segment),
    );
}

export function outermost(
  directories: readonly string[],
  { rootContainsAll }: { readonly rootContainsAll: boolean } = { rootContainsAll: false },
): string[] {
  return directories.filter(
    (directory) =>
      !directories.some(
        (other) =>
          other !== directory && (rootContainsAll || other !== '.') && isInside(directory, other),
      ),
  );
}

const SUBMODULE_PATH = /^\s*path\s*=(?<folder>.*)$/gmu;

export function listSubmodules(repositoryRoot: string): string[] {
  const text = readTextInside(repositoryRoot, '.gitmodules');
  return [...text.matchAll(SUBMODULE_PATH)]
    .map((match) =>
      (match.groups?.['folder'] ?? '')
        .trim()
        .replace(/^"(.*)"$/u, '$1')
        .replace(/\/+$/u, ''),
    )
    .toSorted(byText);
}
