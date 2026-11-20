import { normalizeGitPath } from './normalize.mts';

export function repositoryPath(projectRelativePath: string): string {
  const normalized = normalizeGitPath(projectRelativePath).replace(/\/$/, '');
  return normalized === '.' ? '' : normalized;
}

export function joinRepositoryPath(directory: string, name: string): string {
  return directory === '' ? name : `${directory}/${name}`;
}

export function repositoryFindingPath(projectPath: string, findingPath: string): string {
  const directory = repositoryPath(projectPath);
  if (findingPath === '') {
    return directory === '' ? '.' : directory;
  }
  return joinRepositoryPath(directory, findingPath);
}

export function relativeToProject(filePath: string, projectRelativePath: string): string {
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
