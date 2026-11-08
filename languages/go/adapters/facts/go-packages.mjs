import path from 'node:path';

const ROOT = '';
const MAIN = 'main';
const INTERNAL = 'internal';

export function directoryOf(file) {
  const directory = path.posix.dirname(file);
  return directory === '.' ? ROOT : directory;
}

function isFetchable(module) {
  return module.split('/')[0].includes('.');
}

function packageNames(files) {
  const names = new Map();
  for (const file of files.filter(({ test }) => !test)) {
    names.set(directoryOf(file.path), file.package);
  }
  return names;
}

export function goPackages(report, module = '') {
  const names = packageNames(report.files);
  const directories = [...new Set(report.files.map(({ path: file }) => directoryOf(file)))].sort();
  function importPathOf(directory) {
    return directory === ROOT ? module : `${module}/${directory}`;
  }
  function directoryOfImport(importPath) {
    if (module === '' || (importPath !== module && !importPath.startsWith(`${module}/`))) {
      return undefined;
    }
    const directory = importPath.slice(module.length + 1);
    return directories.includes(directory) ? directory : undefined;
  }
  function isPublished(directory) {
    return (
      isFetchable(module) &&
      names.has(directory) &&
      names.get(directory) !== MAIN &&
      !importPathOf(directory).split('/').includes(INTERNAL)
    );
  }
  return {
    directories,
    nameOf: (directory) => names.get(directory),
    mains: directories.filter((directory) => names.get(directory) === MAIN),
    directoryOfImport,
    isPublished,
  };
}
