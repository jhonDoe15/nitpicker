import path from 'node:path';
import type { GoFile, GoPackages, InspectReport } from '../go-types.mts';

const ROOT = '';
const MAIN = 'main';
const INTERNAL = 'internal';

export function directoryOf(file: string): string {
  const directory = path.posix.dirname(file);
  return directory === '.' ? ROOT : directory;
}

function isFetchable(module: string) {
  return (module.split('/')[0] ?? '').includes('.');
}

function mostCommon(values: readonly string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const [name] = [...counts].reduce<readonly [string | undefined, number]>(
    (best, entry) => (entry[1] > best[1] ? entry : best),
    [undefined, 0],
  );
  return name;
}

function packageNames(files: readonly GoFile[]) {
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

export function goPackages(report: Pick<InspectReport, 'files'>, module = ''): GoPackages {
  const names = packageNames(report.files);
  const directories = [
    ...new Set(report.files.map(({ path: file }) => directoryOf(file))),
  ].toSorted((left, right) => left.localeCompare(right));
  function importPathOf(directory: string) {
    return directory === ROOT ? module : `${module}/${directory}`;
  }
  function directoryOfImport(importPath: string) {
    if (module === '' || (importPath !== module && !importPath.startsWith(`${module}/`))) {
      return undefined;
    }
    const directory = importPath.slice(module.length + 1);
    return directories.includes(directory) ? directory : undefined;
  }
  function isPublished(directory: string) {
    return (
      isFetchable(module) &&
      names.has(directory) &&
      names.get(directory) !== MAIN &&
      !importPathOf(directory).split('/').includes(INTERNAL)
    );
  }
  return {
    directories,
    nameOf: (directory) => (directory === undefined ? undefined : names.get(directory)),
    mains: directories.filter((directory) => names.get(directory) === MAIN),
    directoryOfImport,
    importPathOf,
    isPublished,
  };
}
