import { normalizeGitPath } from './normalize.mjs';

export function repositoryPath(projectRelativePath) {
  const normalized = normalizeGitPath(projectRelativePath).replace(/\/$/, '');
  return normalized === '.' ? '' : normalized;
}

export function joinRepositoryPath(directory, name) {
  return directory === '' ? name : `${directory}/${name}`;
}

export function repositoryFindingPath(projectPath, findingPath) {
  const directory = repositoryPath(projectPath);
  if (findingPath === '') {
    return directory === '' ? '.' : directory;
  }
  return joinRepositoryPath(directory, findingPath);
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
