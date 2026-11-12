const JVM_SOURCE = /\.(?:java|kt)$/u;
const TEST_FOLDERS = new Set(['test', 'tests', 'it']);
const TEST_SOURCE_SET = /^tests?(?:$|[A-Z_-])|[a-z0-9](?:Tests?|[_-]tests?)$/u;

export function isJvmSourcePath(file) {
  return JVM_SOURCE.test(file);
}

function isTestSourceSet(name) {
  return name === 'it' || TEST_SOURCE_SET.test(name);
}

export function isJvmTestPath(file) {
  const folders = file.split('/').slice(0, -1);
  const sourceSet = folders.indexOf('src') + 1;
  if (sourceSet > 0 && sourceSet < folders.length) {
    return isJvmSourcePath(file) && isTestSourceSet(folders[sourceSet]);
  }
  return isJvmSourcePath(file) && folders.some((folder) => TEST_FOLDERS.has(folder));
}

export function isJvmProductionPath(file) {
  return isJvmSourcePath(file) && !isJvmTestPath(file);
}
