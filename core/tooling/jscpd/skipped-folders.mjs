export const SCRIPT_SKIPPED_FOLDERS = ['dist', 'build', 'generated', 'target'];
export const JVM_SKIPPED_FOLDERS = ['build', 'generated', 'target', 'out'];
export const PYTHON_SKIPPED_FOLDERS = ['build', 'dist', 'tests', 'test', 'migrations'];

export function skippedFolderGlobs(folders) {
  return folders.map((name) => `**/${name}/**`);
}

export function withSkippedFolders(ignore, defaults, configured) {
  if (configured === undefined) {
    return ignore;
  }
  const replaced = new Set(skippedFolderGlobs(defaults));
  return [...ignore.filter((glob) => !replaced.has(glob)), ...skippedFolderGlobs(configured)];
}
