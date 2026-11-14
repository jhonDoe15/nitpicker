import path from 'node:path';
import { isInside } from '../../discovery/repository-files.mjs';
import { javascriptUnit, nxUnit } from './javascript.mjs';
import { jvmUnit } from './jvm.mjs';
import { pythonUnit } from './python.mjs';

type DependencyUnit = {
  readonly names: readonly string[];
  readonly needs: readonly string[];
  readonly folders: readonly string[];
};
export type DependencyGraph = ReadonlyMap<string, ReadonlySet<string>>;
type UnitReader = (directory: string) => DependencyUnit | undefined;
type Lookup = {
  readonly byName: ReadonlyMap<string, string>;
  readonly projectPaths: readonly string[];
  readonly folderOf: (projectPath: string) => string;
};

const READERS: readonly UnitReader[] = [javascriptUnit, nxUnit, pythonUnit, jvmUnit];

function unitOf(directory: string): DependencyUnit {
  const units = READERS.map((read) => read(directory)).filter((unit) => unit !== undefined);
  return {
    names: units.flatMap((unit) => unit.names),
    needs: units.flatMap((unit) => unit.needs),
    folders: units.flatMap((unit) => unit.folders),
  };
}

function depthOf(projectPath: string): number {
  return projectPath === '.' ? 0 : projectPath.length + 1;
}

export function deepestProject(
  projectPaths: readonly string[],
  folder: string,
): string | undefined {
  return projectPaths
    .filter((projectPath) => isInside(folder, projectPath))
    .reduce<string | undefined>(
      (deepest, projectPath) =>
        deepest === undefined || depthOf(projectPath) > depthOf(deepest) ? projectPath : deepest,
      undefined,
    );
}

function edgesOf(
  projectPath: string,
  unit: DependencyUnit,
  { byName, projectPaths, folderOf }: Lookup,
): Set<string> {
  const folders = projectPaths.map(folderOf);
  const named = unit.needs.map((need) => byName.get(need));
  const located = unit.folders
    .map((folder) => path.posix.normalize(path.posix.join(folderOf(projectPath), folder)))
    .filter((resolved) => !resolved.startsWith('..'))
    .map((resolved) => deepestProject(folders, resolved))
    .flatMap((folder) => projectPaths.filter((other) => folderOf(other) === folder));
  return new Set(
    [...named, ...located].filter(
      (other): other is string => other !== undefined && other !== projectPath,
    ),
  );
}

export function dependencyGraph(
  root: string,
  projectPaths: readonly string[],
  folders: ReadonlyMap<string, string> = new Map(),
): DependencyGraph {
  const folderOf = (projectPath: string): string => folders.get(projectPath) ?? projectPath;
  const units = new Map(
    projectPaths.map((projectPath) => [
      projectPath,
      unitOf(path.join(root, folderOf(projectPath))),
    ]),
  );
  const byName = new Map(
    [...units].flatMap(([projectPath, unit]) =>
      unit.names.map((name): [string, string] => [name, projectPath]),
    ),
  );
  return new Map(
    [...units].map(([projectPath, unit]) => [
      projectPath,
      edgesOf(projectPath, unit, { byName, projectPaths, folderOf }),
    ]),
  );
}

function newDependents(
  graph: DependencyGraph,
  current: string,
  reached: ReadonlySet<string>,
): string[] {
  return [...graph]
    .filter(([candidate, dependencies]) => dependencies.has(current) && !reached.has(candidate))
    .map(([candidate]) => candidate);
}

export function dependentsOf(
  graph: DependencyGraph,
  seeds: ReadonlySet<string>,
): Map<string, string> {
  const reasons = new Map<string, string>();
  const reached = new Set(seeds);
  for (const current of reached) {
    for (const candidate of newDependents(graph, current, reached)) {
      reasons.set(candidate, current);
      reached.add(candidate);
    }
  }
  return reasons;
}
