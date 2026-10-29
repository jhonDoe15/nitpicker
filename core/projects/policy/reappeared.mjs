import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { runGit } from '../../diff/git/repository/command.mjs';
import { gitBlobId } from '../../policy-changes/policy-scope.mjs';
import { isInside } from '../discovery/repository-files.mjs';

const EMPTY_BLOB = gitBlobId(Buffer.alloc(0));

function repositoryPathOf(prefix, folder) {
  return path.posix.normalize(path.posix.join(prefix, folder));
}

function planRelative(prefix, file) {
  if (prefix === '.') {
    return file;
  }
  return file.startsWith(`${prefix}/`) ? file.slice(prefix.length + 1) : undefined;
}

function contentOf(root, file) {
  const full = path.resolve(root, file);
  if (!full.startsWith(root + path.sep)) {
    return undefined;
  }
  if (!existsSync(full) || !statSync(full).isFile()) {
    return undefined;
  }
  return gitBlobId(readFileSync(full));
}

function outsideFiles({ plan, changed }) {
  const folders = plan.projects.map(({ path: folder }) => folder);
  return changed
    .map((file) => planRelative(plan.prefix, file))
    .filter((file) => file !== undefined)
    .filter((file) => !folders.some((folder) => isInside(file, folder)))
    .flatMap((file) => {
      const blob = contentOf(plan.root, file);
      return blob === undefined ? [] : [{ file, blob }];
    });
}

function baseEntries({ plan, mergeBaseSha }, folder) {
  const location = repositoryPathOf(plan.prefix, folder);
  return runGit(plan.repositoryRoot, ['ls-tree', '-r', '-z', mergeBaseSha, '--', `${location}/`])
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t');
      return {
        blob: line.slice(0, tab).split(' ')[2],
        tail: line.slice(tab + 1).slice(location.length + 1),
      };
    });
}

function reappears(entries, outside) {
  const blobs = new Set(outside.map(({ blob }) => blob).filter((blob) => blob !== EMPTY_BLOB));
  return entries.some(
    ({ blob, tail }) =>
      blobs.has(blob) ||
      (tail.includes('/') && outside.some(({ file }) => file.endsWith(`/${tail}`))),
  );
}

export function reappearedProjects({ plan, basePlan, comparison }) {
  if (basePlan === undefined || comparison.mergeBaseSha === undefined) {
    return new Set();
  }
  const current = new Set(plan.projects.map(({ path: folder }) => folder));
  const removed = basePlan.projects
    .map(({ path: folder }) => folder)
    .filter((folder) => folder !== '.' && !current.has(folder));
  const outside = removed.length === 0 ? [] : outsideFiles({ plan, changed: comparison.changed });
  if (outside.length === 0) {
    return new Set();
  }
  const context = { plan, mergeBaseSha: comparison.mergeBaseSha };
  return new Set(removed.filter((folder) => reappears(baseEntries(context, folder), outside)));
}
