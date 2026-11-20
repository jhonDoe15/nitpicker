import { readRepositoryChanges } from '../git/patches/changes.mts';

export type ChangedFile = {
  readonly path: string;
  readonly kind: 'removed' | 'added' | 'modified';
};

export function changedFiles({
  repositoryRoot,
  mergeBaseSha,
  headSha,
}: {
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string;
  readonly headSha: string;
}): ChangedFile[] {
  const changes = readRepositoryChanges({ repositoryRoot, mergeBaseSha, headSha });
  const moved = new Set(changes.renames.flat());
  return [...changes.touched].map((file): ChangedFile => {
    if (changes.deleted.has(file) || moved.has(file)) {
      return { path: file, kind: 'removed' };
    }
    return { path: file, kind: changes.added.has(file) ? 'added' : 'modified' };
  });
}
