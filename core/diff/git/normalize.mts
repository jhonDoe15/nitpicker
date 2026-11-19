import path from 'node:path';

export function normalizeGitPath(value: string): string {
  return path.posix.normalize(value.replaceAll('\\', '/')).replace(/^\.\//, '');
}
