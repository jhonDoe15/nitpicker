import path from 'node:path';
import { joinRepositoryPath, repositoryPath } from '../paths.mjs';
import { runGit, GitCommandError } from '../repository/command.mjs';
import { readRepositoryChanges } from './changes.mjs';
import { scopeMoves, scopeTouched } from './renames.mjs';

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
  return scopeMoves({
    changes,
    baseProjectPath: repositoryPath(baseProjectRelativePath),
    headProjectPath: repositoryPath(projectRelativePath),
  });
}

export function readTouchedPaths({
  repositoryRoot,
  mergeBaseSha,
  headSha,
  projectRelativePath,
  baseProjectRelativePath = projectRelativePath,
  changes = readRepositoryChanges({ repositoryRoot, mergeBaseSha, headSha }),
}) {
  return scopeTouched(changes.touched, {
    baseProjectPath: repositoryPath(baseProjectRelativePath),
    headProjectPath: repositoryPath(projectRelativePath),
  });
}
