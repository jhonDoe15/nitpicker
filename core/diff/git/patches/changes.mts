import { runGit } from '../repository/command.mts';
import { normalizeGitPath } from '../normalize.mts';

export type RepositoryChanges = {
  readonly renames: [string, string][];
  readonly added: Set<string>;
  readonly deleted: Set<string>;
  readonly touched: Set<string>;
};

type ChangeEntry = { status: string; paths: string[] };

export function readRepositoryChanges({
  repositoryRoot,
  mergeBaseSha,
  headSha,
}: {
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string;
  readonly headSha: string;
}): RepositoryChanges {
  const output = runGit(repositoryRoot, [
    '-c',
    RENAME_LIMIT_SETTING,
    'diff',
    RENAME_DETECTION,
    '--name-status',
    '-z',
    `${mergeBaseSha}...${headSha}`,
  ]);
  return parseNameStatus(output.split('\0'));
}

export const RENAME_LIMIT_SETTING = 'diff.renameLimit=20000';

export const RENAME_DETECTION = '--find-renames=50%';

function parseNameStatus(fields: readonly string[]): RepositoryChanges {
  const changes: RepositoryChanges = {
    renames: [],
    added: new Set(),
    deleted: new Set(),
    touched: new Set(),
  };
  const entry: ChangeEntry = { status: '', paths: [] };
  for (const field of fields) {
    if (entry.status === '') {
      entry.status = field;
    } else {
      entry.paths.push(field);
    }
    if (entry.paths.length === pathCount(entry.status)) {
      recordChange(changes, entry);
      entry.status = '';
      entry.paths = [];
    }
  }
  if (entry.status !== '') {
    throw new Error('Malformed git rename output: missing changed path');
  }
  return changes;
}

function pathCount(status: string): number {
  if (status === '') {
    return -1;
  }
  return status.startsWith('R') || status.startsWith('C') ? 2 : 1;
}

function recordChange(changes: RepositoryChanges, { status, paths }: ChangeEntry): void {
  const normalized = paths.map(normalizeGitPath);
  const [first = '', second = ''] = normalized;
  for (const touched of status.startsWith('C') ? [second] : normalized) {
    changes.touched.add(touched);
  }
  const recorders = new Map<string, () => unknown>([
    ['R', () => changes.renames.push([first, second])],
    ['A', () => changes.added.add(first)],
    ['D', () => changes.deleted.add(first)],
  ]);
  recorders.get(status.charAt(0))?.();
}
