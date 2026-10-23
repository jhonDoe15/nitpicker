import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../filesystem.mjs';
import { projectFilesUnder } from '../project-files/project-files.mjs';

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git']);

function projectRootFiles(projectRoot, root) {
  const absolute = pathInside(projectRoot, root);
  if (absolute === undefined || !existsSync(absolute)) {
    return [];
  }
  const files = projectFilesUnder(absolute, {
    skipDirectory: (_, entry) => SKIPPED_DIRECTORIES.has(entry.name),
  });
  return files.map((file) => path.relative(projectRoot, file).split(path.sep).join('/'));
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
