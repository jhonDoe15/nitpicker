import path from 'node:path';
import { joinRepositoryPath, relativeToProject, repositoryPath } from '../paths.mjs';
import { runGit, GitCommandError } from '../repository/command.mjs';
import { readRepositoryChanges } from './changes.mjs';
import { scopeMoves } from './renames.mjs';

const PROJECT_MARKERS = ['nitpicker.config.json', 'package.json'];

export function resolveBaseProjectPath({
  repositoryRoot,
  mergeBaseSha,
  headSha,
  projectRelativePath,
  changes = readRepositoryChanges({ repositoryRoot, mergeBaseSha, headSha }),
}) {
  const headProject = repositoryPath(projectRelativePath);
  const baseLocations = PROJECT_MARKERS.map((marker) => joinRepositoryPath(headProject, marker))
    .filter((headMarker) => existsInCommit(repositoryRoot, headSha, headMarker))
    .map((headMarker) =>
      locateMarkerInBase({
        repositoryRoot,
        mergeBaseSha,
        headMarker,
        projectRelativePath,
        changes,
      }),
    );
  return baseLocations.find((location) => location !== undefined) ?? projectRelativePath;
}

function locateMarkerInBase({
  repositoryRoot,
  mergeBaseSha,
  headMarker,
  projectRelativePath,
  changes,
}) {
  if (existsInCommit(repositoryRoot, mergeBaseSha, headMarker)) {
    return projectRelativePath;
  }
  const moved = changes.renames.find(([, newPath]) => newPath === headMarker);
  return moved === undefined ? undefined : path.posix.dirname(moved[0]);
}

function existsInCommit(repositoryRoot, sha, repositoryRelativePath) {
  try {
    runGit(repositoryRoot, ['cat-file', '-e', `${sha}:${repositoryRelativePath}`]);
    return true;
  } catch (error) {
    if (error instanceof GitCommandError) {
      return false;
    }
    throw error;
  }
}

export function readProjectMoves({
  repositoryRoot,
  mergeBaseSha,
  headSha,
  projectRelativePath,
  baseProjectRelativePath = projectRelativePath,
  changes = readRepositoryChanges({ repositoryRoot, mergeBaseSha, headSha }),
}) {
  const baseProjectPath = repositoryPath(baseProjectRelativePath);
  const moves = scopeMoves({
    changes,
    baseProjectPath,
    headProjectPath: repositoryPath(projectRelativePath),
  });
  const base = { repositoryRoot, mergeBaseSha, baseProjectPath };
  return { ...moves, kept: keptUnderMovedFolders(base, changes, moves.directories) };
}

function keptUnderMovedFolders(
  { repositoryRoot, mergeBaseSha, baseProjectPath },
  changes,
  folders,
) {
  if (folders.size === 0) {
    return new Set();
  }
  const pathspec = baseProjectPath === '' ? [] : ['--', baseProjectPath];
  const listed = runGit(repositoryRoot, [
    'ls-tree',
    '-r',
    '--name-only',
    '-z',
    '--full-tree',
    mergeBaseSha,
    ...pathspec,
  ]);
  const gone = new Set([...changes.deleted, ...changes.renames.map(([from]) => from)]);
  const moved = [...folders.keys()];
  return new Set(
    listed
      .split('\0')
      .filter((file) => file !== '' && !gone.has(file))
      .map((file) => relativeToProject(file, baseProjectPath))
      .filter((file) => moved.some((folder) => file.startsWith(`${folder}/`))),
  );
}

export function readRenameMap(options) {
  return readProjectMoves(options).files;
}
