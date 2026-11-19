import path from 'node:path';

export function inModule(modulePath: string | undefined, relativePath: string): string {
  if (modulePath === undefined || modulePath === '') {
    return relativePath;
  }
  return relativePath === '.' ? modulePath : path.posix.normalize(`${modulePath}/${relativePath}`);
}

function asDirectory(root: string): string {
  const normalized = path.posix.normalize(root).replace(/\/+$/u, '');
  return normalized === '' ? '.' : normalized;
}

function inProject(modulePath: string, root: string): string | undefined {
  const slashed = root.replaceAll('\\', '/');
  if (slashed.startsWith('/') || /^[A-Za-z]:/u.test(slashed)) {
    return undefined;
  }
  const directory = asDirectory(path.posix.join(modulePath, slashed));
  return directory === '..' || directory.startsWith('../') ? undefined : directory;
}

export function rootsScope(
  roots: readonly string[],
  { moduleDir = '', modulePath = '' }: { moduleDir?: string; modulePath?: string } = {},
): string[] {
  const directories = (roots.length === 0 ? [moduleDir] : roots).map((root) =>
    inProject(modulePath, root),
  );
  return [
    ...new Set(directories.filter((directory): directory is string => directory !== undefined)),
  ];
}

export function liesInProject(
  projectPath: string,
  { modulePath = '' }: { modulePath?: string } = {},
): boolean {
  return inProject(modulePath, projectPath) !== undefined;
}
