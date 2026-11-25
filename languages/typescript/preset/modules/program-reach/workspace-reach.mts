import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { ancestorDirectories } from '../../../../../shared/filesystem.mts';
import { isInsideDirectory } from '../../../../../shared/paths/contained-path.mts';
import { fieldOf, fieldsOf, parseJson } from '../../../../../shared/values/readers.mts';
import { coveringAncestorTsconfig } from '../../project-configs/typescript/ancestor-tsconfig.mts';
import { PROJECT_TSCONFIG } from '../tsconfig-files.mts';
import { outermost, typecheckProgramRoots } from './program-roots.mts';

const PROJECT_DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];
const LIBRARY_DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies'];
const DEPENDENCY_FOLDER = 'node_modules';

function manifestOf(directory: string): unknown {
  const file = path.join(directory, 'package.json');
  if (!existsSync(file)) {
    return undefined;
  }
  try {
    return parseJson(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function dependencyNames(directory: string, fields: readonly string[]): string[] {
  const manifest = manifestOf(directory);
  return fields.flatMap((field) => Object.keys(fieldsOf(fieldOf(manifest, field))));
}

function resolvedFolder(folder: string): string {
  return existsSync(folder) ? realpathSync(folder) : folder;
}

function repositoryOf(directory: string): string | undefined {
  return ancestorDirectories(directory).find((ancestor) => existsSync(path.join(ancestor, '.git')));
}

function isWorkspaceFolder(folder: string, start: string, repository: string | undefined): boolean {
  return (
    !isDependencyCopy(folder) &&
    !isInsideDirectory(folder, start) &&
    (repository === undefined || (folder !== repository && isInsideDirectory(repository, folder)))
  );
}

function isDependencyCopy(directory: string): boolean {
  return directory.split(path.sep).includes(DEPENDENCY_FOLDER);
}

function installedFolder(name: string, from: string): string | undefined {
  for (const ancestor of ancestorDirectories(from)) {
    const candidate = path.join(ancestor, DEPENDENCY_FOLDER, name);
    if (existsSync(candidate)) {
      return realpathSync(candidate);
    }
  }
  return undefined;
}

export function workspaceDependencyFolders(projectRoot: string): string[] {
  const start = resolvedFolder(path.resolve(projectRoot));
  const repository = repositoryOf(start);
  const reached = new Set([start]);
  for (const folder of reached) {
    const fields = folder === start ? PROJECT_DEPENDENCY_FIELDS : LIBRARY_DEPENDENCY_FIELDS;
    for (const name of dependencyNames(folder, fields)) {
      const dependency = installedFolder(name, folder);
      if (dependency !== undefined && isWorkspaceFolder(dependency, start, repository)) {
        reached.add(dependency);
      }
    }
  }
  return [...reached];
}

const reachedRoots = new Map<string, readonly string[]>();

export function programReachRoots(projectRoot: string): readonly string[] {
  const known = reachedRoots.get(projectRoot);
  if (known !== undefined) {
    return known;
  }
  const roots = outermost([
    ...typecheckProgramRoots(projectRoot).map(resolvedFolder),
    ...workspaceDependencyFolders(projectRoot),
  ]);
  reachedRoots.set(projectRoot, roots);
  return roots;
}

export function holdsProgram(projectRoot: string): boolean {
  return (
    existsSync(path.join(projectRoot, PROJECT_TSCONFIG)) ||
    coveringAncestorTsconfig(projectRoot) !== undefined
  );
}
