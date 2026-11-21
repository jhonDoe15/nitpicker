import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import type { ChangedFile } from './changed-files.mts';
import { LARGE_FILE_BYTES } from '../../../shared/project-rules/hygiene-rules.mts';
import { PRIVATE_KEY_HEADER } from '../../../shared/hygiene/files/repository-files.mts';
import { GIT_TIMEOUT_MS } from '../../../shared/processes/deadlines.mts';

function git(repositoryRoot: string, args: readonly string[]): SpawnSyncReturns<string> {
  return spawnSync('git', [...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
  });
}

function sizeOf(repositoryRoot: string, sha: string, file: string): number | undefined {
  const result = git(repositoryRoot, ['cat-file', '-s', `${sha}:${file}`]);
  return result.status === 0 ? Number(result.stdout.trim()) : undefined;
}

function holdsKey(repositoryRoot: string, sha: string, file: string): boolean {
  const result = git(repositoryRoot, [
    'grep',
    '-q',
    '-I',
    '-E',
    '-e',
    PRIVATE_KEY_HEADER,
    sha,
    '--',
    `:(literal)${file}`,
  ]);
  return result.status !== 1;
}

function sideChangesNothing(repositoryRoot: string, sha: string, file: string): boolean {
  const size = sizeOf(repositoryRoot, sha, file);
  return size !== undefined && size <= LARGE_FILE_BYTES && !holdsKey(repositoryRoot, sha, file);
}

export function hygieneReadsContent({
  repositoryRoot,
  mergeBaseSha,
  headSha,
}: {
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string;
  readonly headSha: string;
}): (change: ChangedFile) => boolean {
  return ({ path: file, kind }) =>
    kind !== 'modified' ||
    !(
      sideChangesNothing(repositoryRoot, mergeBaseSha, file) &&
      sideChangesNothing(repositoryRoot, headSha, file)
    );
}
