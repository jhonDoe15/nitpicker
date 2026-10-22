import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { filesUnder, pathInside } from '../filesystem.mjs';

const MAX_LISTING_BYTES = 64 * 1024 * 1024;
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git']);

function listedByGit(projectRoot, roots) {
  const listed = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...roots],
    { cwd: projectRoot, encoding: 'utf8', maxBuffer: MAX_LISTING_BYTES },
  );
  return listed.status === 0 ? listed.stdout.split('\0').filter(Boolean) : undefined;
}

function walkedRoot(projectRoot, root) {
  const absolute = pathInside(projectRoot, root);
  if (absolute === undefined || !existsSync(absolute)) {
    return [];
  }
  const files = filesUnder(absolute, {
    skipDirectory: (_, entry) => SKIPPED_DIRECTORIES.has(entry.name),
  });
  return [...files].map((file) => path.relative(projectRoot, file).split(path.sep).join('/'));
}

function walked(projectRoot, roots) {
  return roots.flatMap((root) => walkedRoot(projectRoot, root));
}

export function readProjectFile(projectRoot, file) {
  const absolute = pathInside(projectRoot, file);
  return absolute !== undefined && existsSync(absolute)
    ? readFileSync(absolute, 'utf8')
    : undefined;
}

export function sourceFilesUnder(projectRoot, roots, extensions) {
  const found = listedByGit(projectRoot, roots) ?? walked(projectRoot, roots);
  return [...new Set(found)]
    .filter((file) => extensions.some((extension) => file.endsWith(extension)))
    .filter((file) => !file.split('/').some((part) => SKIPPED_DIRECTORIES.has(part)))
    .sort();
}
