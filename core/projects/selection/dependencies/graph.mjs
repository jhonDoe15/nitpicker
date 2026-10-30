import path from 'node:path';
import { isInside } from '../../discovery/repository-files.mjs';
import { javascriptUnit } from './javascript.mjs';
import { jvmUnit } from './jvm.mjs';
import { pythonUnit } from './python.mjs';

const READERS = [javascriptUnit, pythonUnit, jvmUnit];

function unitOf(directory) {
  const units = READERS.map((read) => read(directory)).filter((unit) => unit !== undefined);
  return {
    names: units.flatMap((unit) => unit.names),
    needs: units.flatMap((unit) => unit.needs),
    folders: units.flatMap((unit) => unit.folders),
  };
}

function depthOf(projectPath) {
  return projectPath === '.' ? 0 : projectPath.length + 1;
}

export function deepestProject(projectPaths, folder) {
  return projectPaths
    .filter((projectPath) => isInside(folder, projectPath))
    .toSorted((left, right) => depthOf(right) - depthOf(left))[0];
}

function edgesOf(projectPath, unit, { byName, projectPaths }) {
  const named = unit.needs.map((need) => byName.get(need));
  const located = unit.folders
    .map((folder) => path.posix.normalize(path.posix.join(projectPath, folder)))
    .filter((resolved) => !resolved.startsWith('..'))
    .map((resolved) => deepestProject(projectPaths, resolved));
  return new Set(
    [...named, ...located].filter((other) => other !== undefined && other !== projectPath),
  );
}

export function dependencyGraph(root, projectPaths) {
  const units = new Map(
    projectPaths.map((projectPath) => [projectPath, unitOf(path.join(root, projectPath))]),
  );
  const byName = new Map(
    [...units].flatMap(([projectPath, unit]) => unit.names.map((name) => [name, projectPath])),
  );
  return new Map(
    [...units].map(([projectPath, unit]) => [
      projectPath,
      edgesOf(projectPath, unit, { byName, projectPaths }),
    ]),
  );
}

function newDependents(graph, current, reached) {
  return [...graph]
    .filter(([candidate, dependencies]) => dependencies.has(current) && !reached.has(candidate))
    .map(([candidate]) => candidate);
}

export function dependentsOf(graph, seeds) {
  const reasons = new Map();
  const reached = new Set(seeds);
  for (const current of reached) {
    for (const candidate of newDependents(graph, current, reached)) {
      reasons.set(candidate, current);
      reached.add(candidate);
    }
  }
  return reasons;
}
