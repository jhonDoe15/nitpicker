import { runGit } from '../repository/command.mjs';
import { normalizeGitPath } from '../normalize.mjs';

export function readRepositoryChanges({ repositoryRoot, mergeBaseSha, headSha }) {
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

function parseNameStatus(fields) {
  const changes = { renames: [], added: new Set(), deleted: new Set() };
  const entry = { status: '', paths: [] };
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

function pathCount(status) {
  if (status === '') {
    return -1;
  }
  return status.startsWith('R') || status.startsWith('C') ? 2 : 1;
}

function recordChange(changes, { status, paths }) {
  const [first, second] = paths.map(normalizeGitPath);
  const recorders = new Map([
    ['R', () => changes.renames.push([first, second])],
    ['A', () => changes.added.add(first)],
    ['D', () => changes.deleted.add(first)],
  ]);
  recorders.get(status[0])?.();
}
