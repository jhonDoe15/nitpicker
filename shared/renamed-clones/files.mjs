import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../filesystem.mjs';
import { escapeRegExp } from '../paths/glob.mjs';
import { projectFilePaths, projectFilesUnder } from '../project-files/project-files.mjs';

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git']);
const GLOB_CHARACTERS = /[*?[]/u;
const CURRENT_DIRECTORY_PREFIX = /^\.\//u;

function skipsDirectory(_, entry) {
  return SKIPPED_DIRECTORIES.has(entry.name);
}

function skipsEverything() {
  return true;
}

function pathspecPattern(root) {
  const source = escapeRegExp(root.replace(CURRENT_DIRECTORY_PREFIX, ''))
    .replaceAll(String.raw`\*`, '.*')
    .replaceAll(String.raw`\?`, '.');
  return new RegExp(`^${source}$`, 'u');
}

function withAncestors(file) {
  const parts = file.split('/');
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
}

function globRootFiles(projectRoot, root) {
  const pattern = pathspecPattern(root);
  return projectFilePaths(projectRoot, { skipDirectory: skipsDirectory }).filter((file) =>
    withAncestors(file).some((candidate) => pattern.test(candidate)),
  );
}

function relativeToProject(projectRoot, files) {
  return files.map((file) => path.relative(projectRoot, file).split(path.sep).join('/'));
}

function fileRootFiles(projectRoot, absolute) {
  const siblings = projectFilesUnder(path.dirname(absolute), { skipDirectory: skipsEverything });
  return relativeToProject(
    projectRoot,
    siblings.filter((file) => file === absolute),
  );
}

function projectRootFiles(projectRoot, root) {
  if (GLOB_CHARACTERS.test(root)) {
    return globRootFiles(projectRoot, root);
  }
  const absolute = pathInside(projectRoot, root);
  if (absolute === undefined || !existsSync(absolute)) {
    return [];
  }
  if (statSync(absolute).isFile()) {
    return fileRootFiles(projectRoot, absolute);
  }
  return relativeToProject(
    projectRoot,
    projectFilesUnder(absolute, { skipDirectory: skipsDirectory }),
  );
}

export function readProjectFile(projectRoot, file) {
  const absolute = pathInside(projectRoot, file);
  return absolute !== undefined && existsSync(absolute)
    ? readFileSync(absolute, 'utf8')
    : undefined;
}

export function sourceFilesUnder(projectRoot, roots, extensions) {
  const found = roots.flatMap((root) => projectRootFiles(projectRoot, root));
  return [...new Set(found)]
    .filter((file) => extensions.some((extension) => file.endsWith(extension)))
    .filter((file) => !file.split('/').some((part) => SKIPPED_DIRECTORIES.has(part)))
    .sort();
}
