export const SCRIPT_SKIPPED_FOLDERS = ['dist', 'build', 'generated', 'target'];
export const JVM_SKIPPED_FOLDERS = ['build', 'generated', 'target', 'out'];
export const PYTHON_SKIPPED_FOLDERS = ['build', 'dist', 'tests', 'test', 'migrations'];
export const GO_SKIPPED_FOLDERS = ['testdata', 'vendor'];
export const GO_DUPLICATE_GLOBS = ['**/*_test.go'];

export function skippedFolderGlobs(folders: readonly string[]): string[] {
  return folders.map((name) => `**/${name}/**`);
}

function rootGlob(root: string): string {
  return root.replace(/^\.\//u, '').replace(/\/+$/u, '');
}

export function rootsPattern(roots: readonly string[]): string {
  const folders = [...new Set(roots.map(rootGlob))];
  if (folders.some((folder) => folder === '.' || folder === '')) {
    return '**/*';
  }
  return folders.length === 1 ? `${folders.join(',')}/**/*` : `{${folders.join(',')}}/**/*`;
}

function rootFolderGlobs(folders: readonly string[]): string[] {
  return folders.map((name) => `${name}/**`);
}

export function withSkippedFolders(
  ignore: readonly string[],
  defaults: readonly string[],
  configured: readonly string[] | undefined,
): readonly string[] {
  if (configured === undefined) {
    return ignore;
  }
  const replaced = new Set([...skippedFolderGlobs(defaults), ...rootFolderGlobs(defaults)]);
  return [...ignore.filter((glob) => !replaced.has(glob)), ...skippedFolderGlobs(configured)];
}
