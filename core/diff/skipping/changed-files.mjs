import { readRepositoryChanges } from '../git/patches/changes.mjs';

export function changedFiles({ repositoryRoot, mergeBaseSha, headSha }) {
  const changes = readRepositoryChanges({ repositoryRoot, mergeBaseSha, headSha });
  const moved = new Set(changes.renames.flat());
  return [...changes.touched].map((file) => {
    if (changes.deleted.has(file) || moved.has(file)) {
      return { path: file, kind: 'removed' };
    }
    return { path: file, kind: changes.added.has(file) ? 'added' : 'modified' };
  });
}
