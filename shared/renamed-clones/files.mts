import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../filesystem.mts';
import { cumulativeJoins as untypedCumulativeJoins } from '../lists/items.mjs';
import { escapeRegExp } from '../paths/glob.mts';
import { projectFilePaths, projectFilesUnder } from '../project-files/project-files.mts';
import { posixRelatives } from '../project-files/tree-walk.mts';
import type { DirectoryEntry } from '../project-files/project-files-types.mts';

const cumulativeJoins: (text: string, separator: string) => string[] = untypedCumulativeJoins;

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git']);
const GLOB_CHARACTERS = /[*?[]/u;
const CURRENT_DIRECTORY_PREFIX = /^\.\//u;

function skipsDirectory(_absolute: string, entry: DirectoryEntry): boolean {
  return SKIPPED_DIRECTORIES.has(entry.name);
}

function skipsEverything(): boolean {
  return true;
}

function pathspecPattern(root: string): RegExp {
  const source = escapeRegExp(root.replace(CURRENT_DIRECTORY_PREFIX, ''))
    .replaceAll(String.raw`\*`, '.*')
    .replaceAll(String.raw`\?`, '.');
  return new RegExp(`^${source}$`, 'u');
}

function globRootFiles(projectRoot: string, root: string): string[] {
  const pattern = pathspecPattern(root);
  return projectFilePaths(projectRoot, { skipDirectory: skipsDirectory }).filter((file) =>
    cumulativeJoins(file, '/').some((candidate) => pattern.test(candidate)),
  );
}

function fileRootFiles(projectRoot: string, absolute: string): string[] {
  const siblings = projectFilesUnder(path.dirname(absolute), { skipDirectory: skipsEverything });
  return posixRelatives(
    projectRoot,
    siblings.filter((file) => file === absolute),
  );
}

function projectRootFiles(projectRoot: string, configured: string): string[] {
  if (GLOB_CHARACTERS.test(configured)) {
    return globRootFiles(projectRoot, configured);
  }
  const absolute = pathInside(projectRoot, configured);
  if (absolute === undefined || !existsSync(absolute)) {
    return [];
  }
  if (statSync(absolute).isFile()) {
    return fileRootFiles(projectRoot, absolute);
  }
  return posixRelatives(
    projectRoot,
    projectFilesUnder(absolute, { skipDirectory: skipsDirectory }),
  );
}

export function readProjectFile(projectRoot: string, file: string): string | undefined {
  const absolute = pathInside(projectRoot, file);
  return absolute !== undefined && existsSync(absolute)
    ? readFileSync(absolute, 'utf8')
    : undefined;
}

export function sourceFilesUnder(
  projectRoot: string,
  roots: readonly string[],
  extensions: readonly string[],
): string[] {
  const found = roots.flatMap((root) => projectRootFiles(projectRoot, root));
  return [...new Set(found)]
    .filter((file) => extensions.some((extension) => file.endsWith(extension)))
    .filter((file) => !file.split('/').some((part) => SKIPPED_DIRECTORIES.has(part)))
    .sort();
}
