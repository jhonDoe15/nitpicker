import path from 'node:path';
import { joinRepositoryPath, repositoryPath } from '../paths.mts';
import { runGit, GitCommandError } from '../repository/command.mts';
import { readRepositoryChanges, type RepositoryChanges } from './changes.mts';
import { scopeMoves, scopeTouched, type ScopedMoves } from './renames.mts';

export type ProjectRequest = {
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string;
  readonly headSha: string;
  readonly projectRelativePath: string;
  readonly baseProjectRelativePath?: string | undefined;
  readonly changes?: RepositoryChanges | undefined;
};

const PROJECT_MARKERS = ['nitpicker.config.json', 'package.json'];

export function resolveBaseProjectPath({
  repositoryRoot,
  mergeBaseSha,
  headSha,
  projectRelativePath,
  changes = readRepositoryChanges({ repositoryRoot, mergeBaseSha, headSha }),
}: Omit<ProjectRequest, 'baseProjectRelativePath'>): string {
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
}: {
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string;
  readonly headMarker: string;
  readonly projectRelativePath: string;
  readonly changes: RepositoryChanges;
}): string | undefined {
  if (existsInCommit(repositoryRoot, mergeBaseSha, headMarker)) {
    return projectRelativePath;
  }
  const moved = changes.renames.find(([, newPath]) => newPath === headMarker);
  return moved === undefined ? undefined : path.posix.dirname(moved[0]);
}

function existsInCommit(
  repositoryRoot: string,
  sha: string,
  repositoryRelativePath: string,
): boolean {
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
}: ProjectRequest): ScopedMoves {
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
}: ProjectRequest): Set<string> {
  return scopeTouched(changes.touched, {
    baseProjectPath: repositoryPath(baseProjectRelativePath),
    headProjectPath: repositoryPath(projectRelativePath),
  });
}

export function readRenameMap(options: ProjectRequest): Map<string, string> {
  return readProjectMoves(options).files;
}

function readTreeFiles({
  repositoryRoot,
  sha,
  scopePath,
}: {
  readonly repositoryRoot: string;
  readonly sha: string;
  readonly scopePath: string;
}): string[] {
  const scope = repositoryPath(scopePath);
  const prefix = scope === '' ? '' : `${scope}/`;
  return runGit(repositoryRoot, [
    'ls-tree',
    '-r',
    '--name-only',
    '-z',
    sha,
    '--',
    scope === '' ? '.' : scope,
  ])
    .split('\0')
    .filter((file) => file.startsWith(prefix) && file !== prefix)
    .map((file) => file.slice(prefix.length));
}

export function readBaseFiles({
  repositoryRoot,
  mergeBaseSha,
  projectRelativePath,
  baseProjectRelativePath = projectRelativePath,
}: {
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string;
  readonly projectRelativePath: string;
  readonly baseProjectRelativePath?: string;
}): string[] {
  return readTreeFiles({ repositoryRoot, sha: mergeBaseSha, scopePath: baseProjectRelativePath });
}

export function readHeadFiles({
  repositoryRoot,
  headSha,
  projectRelativePath,
}: {
  readonly repositoryRoot: string;
  readonly headSha: string;
  readonly projectRelativePath: string;
}): string[] {
  return readTreeFiles({ repositoryRoot, sha: headSha, scopePath: projectRelativePath });
}
