const JVM_SOURCE = /\.(?:java|kt)$/u;
const TEST_FOLDERS = new Set(['test', 'tests', 'it']);
const TEST_SOURCE_SET = /^tests?(?:$|[A-Z_-])|[a-z0-9](?:Tests?|[_-]tests?)$/u;

function isJvmSourcePath(file: string): boolean {
  return JVM_SOURCE.test(file);
}

function isTestSourceSet(name: string): boolean {
  return name === 'it' || TEST_SOURCE_SET.test(name);
}

export function isJvmTestPath(file: string): boolean {
  const folders = file.split('/').slice(0, -1);
  const sourceSet = folders.indexOf('src') + 1;
  const name = folders[sourceSet];
  if (sourceSet > 0 && name !== undefined) {
    return isJvmSourcePath(file) && isTestSourceSet(name);
  }
  return isJvmSourcePath(file) && folders.some((folder) => TEST_FOLDERS.has(folder));
}

export function isJvmProductionPath(file: string): boolean {
  return isJvmSourcePath(file) && !isJvmTestPath(file);
}
