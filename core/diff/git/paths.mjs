import { readRepositoryChanges } from './patches/changes.mjs';

import path from 'node:path';

import { normalizeGitPath } from './normalize.mjs';

import { runGit, GitCommandError } from './repository/command.mjs';

import { scopeMoves } from './patches/renames.mjs';

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

export function repositoryPath(projectRelativePath) {
  const normalized = normalizeGitPath(projectRelativePath).replace(/\/$/, '');
  return normalized === '.' ? '' : normalized;
}

export function joinRepositoryPath(directory, name) {
  return directory === '' ? name : `${directory}/${name}`;
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

export function readRenameMap(options) {
  return readProjectMoves(options).files;
}

export function relativeToProject(filePath, projectRelativePath) {
  const normalizedPath = normalizeGitPath(filePath);
  if (projectRelativePath === '.' || projectRelativePath.length === 0) {
    return normalizedPath;
  }
  const prefix = `${projectRelativePath}/`;
  if (!normalizedPath.startsWith(prefix)) {
    throw new Error(`Git returned path outside project root: ${normalizedPath}`);
  }
  return normalizedPath.slice(prefix.length);
}
