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

function mostCommon(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].toSorted(([, left], [, right]) => right - left)[0]?.[0];
}

function packageNames(files) {
  const byDirectory = Map.groupBy(
    files.filter(({ test }) => !test),
    ({ path: file }) => directoryOf(file),
  );
  return new Map(
    [...byDirectory].map(([directory, members]) => {
      const built = members.filter(({ constrained }) => !constrained);
      return [
        directory,
        mostCommon((built.length > 0 ? built : members).map((file) => file.package)),
      ];
    }),
  );
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
