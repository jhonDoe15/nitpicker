import { spawnSync } from 'node:child_process';
import { LARGE_FILE_BYTES } from '../../../shared/project-rules/hygiene-rules.mjs';
import { PRIVATE_KEY_HEADER } from '../../../shared/hygiene/files/repository-files.mjs';
import { GIT_TIMEOUT_MS } from '../../../shared/processes/deadlines.mjs';

function git(repositoryRoot, args) {
  return spawnSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
}

function sizeOf(repositoryRoot, sha, file) {
  const result = git(repositoryRoot, ['cat-file', '-s', `${sha}:${file}`]);
  return result.status === 0 ? Number(result.stdout.trim()) : undefined;
}

function holdsKey(repositoryRoot, sha, file) {
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

function sideChangesNothing(repositoryRoot, sha, file) {
  const size = sizeOf(repositoryRoot, sha, file);
  return size !== undefined && size <= LARGE_FILE_BYTES && !holdsKey(repositoryRoot, sha, file);
}

export function hygieneReadsContent({ repositoryRoot, mergeBaseSha, headSha }) {
  return ({ path: file, kind }) =>
    kind !== 'modified' ||
    !(
      sideChangesNothing(repositoryRoot, mergeBaseSha, file) &&
      sideChangesNothing(repositoryRoot, headSha, file)
    );
}
