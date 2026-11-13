import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { ancestorDirectories, pathInside } from '../../../shared/filesystem.mjs';

const ancestorsOf: (directory: string) => string[] = ancestorDirectories;
const within: (root: string, relative: string) => string | undefined = pathInside;

export function insideProject(root: string, relative: string): string {
  const file = within(root, relative);
  if (file === undefined) {
    throw new Error(`${relative} is outside ${root}`);
  }
  return file;
}

export function hasProjectFile(root: string, ...names: string[]): boolean {
  return names.some((name) => existsSync(insideProject(root, name)));
}

function isFolder(file: string): boolean {
  return statSync(file, { throwIfNoEntry: false })?.isDirectory() === true;
}

function blockingFile(root: string, relative: string): string | undefined {
  const parts = relative.split(/[\\/]/u);
  const folders = parts.slice(0, -1).map((_part, index) => parts.slice(0, index + 1).join('/'));
  return folders.find((folder) => {
    const entry = statSync(insideProject(root, folder), { throwIfNoEntry: false });
    return entry !== undefined && !entry.isDirectory();
  });
}

export function assertNothingInTheWay(root: string, relative: string): void {
  const file = blockingFile(root, relative);
  if (file !== undefined) {
    throw new Error(
      `${file} is a file, so nitpicker init cannot create ${relative} inside it. Rename or remove ${file}, or make the change by hand.`,
    );
  }
  if (isFolder(insideProject(root, relative))) {
    throw new Error(
      `${relative} is a folder, so nitpicker init cannot write it as a file. Rename or remove the folder, or make the change by hand.`,
    );
  }
}

export function projectFileText(root: string, relative: string): string | undefined {
  assertNothingInTheWay(root, relative);
  const file = insideProject(root, relative);
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

function resolvedTarget(file: string): string | undefined {
  const present = [file, ...ancestorsOf(path.dirname(file))].find(
    (candidate) => lstatSync(candidate, { throwIfNoEntry: false }) !== undefined,
  );
  if (present === undefined || !existsSync(present)) {
    return undefined;
  }
  return path.join(realpathSync(present), path.relative(present, file));
}

function linkProblem(root: string, target: string | undefined): string | undefined {
  if (target === undefined) {
    return 'is a symbolic link to a missing file';
  }
  const realRoot = realpathSync(root);
  return within(realRoot, path.relative(realRoot, target)) === undefined
    ? `resolves through a symbolic link to ${target}, outside ${root}`
    : undefined;
}

export function writableProjectFile(root: string, relative: string): string {
  assertNothingInTheWay(root, relative);
  const file = insideProject(root, relative);
  const problem = linkProblem(root, resolvedTarget(file));
  if (problem !== undefined) {
    throw new Error(
      `${relative} ${problem}, so nitpicker init does not write through it. Replace the link with a file, or make the change by hand.`,
    );
  }
  return file;
}
