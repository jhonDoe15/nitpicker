import path from 'node:path';
import { isInside } from '../../discovery/repository-files.mjs';
import { javascriptUnit, nxUnit } from './javascript.mjs';
import { jvmUnit } from './jvm.mjs';
import { pythonUnit } from './python.mjs';
import { typescriptUnit } from './typescript.mjs';

type DependencyUnit = {
  readonly names: readonly string[];
  readonly needs: readonly string[];
  readonly folders: readonly string[];
  readonly labels?: ReadonlyMap<string, string>;
};
export type DependencyGraph = ReadonlyMap<string, ReadonlySet<string>> & {
  readonly labels?: ReadonlyMap<string, string>;
};
type Edges = ReadonlyMap<string, string | undefined>;
type UnitReader = (directory: string) => DependencyUnit | undefined;
type Lookup = {
  readonly byName: ReadonlyMap<string, readonly string[]>;
  readonly projectPaths: readonly string[];
  readonly folderOf: (projectPath: string) => string;
};

const READERS: readonly UnitReader[] = [
  javascriptUnit,
  nxUnit,
  typescriptUnit,
  pythonUnit,
  jvmUnit,
];

function unitOf(directory: string): DependencyUnit {
  const units = READERS.map((read) => read(directory)).filter((unit) => unit !== undefined);
  return {
    names: units.flatMap((unit) => unit.names),
    needs: units.flatMap((unit) => unit.needs),
    folders: units.flatMap((unit) => unit.folders),
    labels: new Map(units.flatMap((unit) => [...(unit.labels ?? [])])),
  };
}

function edgeKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}

export function edgeLabel(graph: DependencyGraph, from: string, to: string): string | undefined {
  return graph.labels?.get(edgeKey(from, to));
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
): Edges {
  const folders = projectPaths.map(folderOf);
  function label(key: string): string | undefined {
    return unit.labels?.get(key);
  }
  const named = unit.needs.flatMap((need) =>
    (byName.get(need) ?? []).map((other) => [other, label(need)] as const),
  );
  const located = unit.folders
    .map((folder) => [path.posix.normalize(path.posix.join(folderOf(projectPath), folder)), folder])
    .filter(([resolved]) => resolved !== undefined && !resolved.startsWith('..'))
    .flatMap(([resolved = '', folder = '']) => {
      const deepest = deepestProject(folders, resolved);
      return projectPaths
        .filter((other) => folderOf(other) === deepest)
        .map((other) => [other, label(folder)] as const);
    });
  const edges = new Map<string, string | undefined>();
  for (const [other, via] of [...named, ...located]) {
    if (other !== projectPath && !edges.has(other)) {
      edges.set(other, via);
    }
  }
  return edges;
}

export function dependencyGraph(
  root: string,
  projectPaths: readonly string[],
  folders: ReadonlyMap<string, string> = new Map(),
): DependencyGraph {
  function folderOf(projectPath: string): string {
    return folders.get(projectPath) ?? projectPath;
  }
  const units = new Map(
    projectPaths.map((projectPath) => [
      projectPath,
      unitOf(path.join(root, folderOf(projectPath))),
    ]),
  );
  const byName = new Map<string, string[]>();
  for (const [projectPath, unit] of units) {
    for (const name of unit.names) {
      byName.set(name, [...(byName.get(name) ?? []), projectPath]);
    }
  }
  const edges = new Map(
    [...units].map(([projectPath, unit]) => [
      projectPath,
      edgesOf(projectPath, unit, { byName, projectPaths, folderOf }),
    ]),
  );
  const labels = new Map(
    [...edges].flatMap(([from, targets]) =>
      [...targets].flatMap(([to, via]) =>
        via === undefined ? [] : [[edgeKey(from, to), via] as const],
      ),
    ),
  );
  const graph = new Map([...edges].map(([from, targets]) => [from, new Set(targets.keys())]));
  return Object.assign(graph, { labels });
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
