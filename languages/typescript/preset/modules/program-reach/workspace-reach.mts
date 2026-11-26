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
  } catch (error) {
    return { unreadable: String(error) };
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
    const folder = path.resolve(ancestor, DEPENDENCY_FOLDER);
    const candidate = path.resolve(folder, name);
    if (!candidate.startsWith(folder + path.sep)) {
      return undefined;
    }
    if (existsSync(candidate)) {
      return realpathSync(candidate);
    }
  }
  return undefined;
}

type Walk = { readonly start: string; readonly repository: string | undefined };

function dependencyFolders(folder: string, { start, repository }: Walk): string[] {
  const fields = folder === start ? PROJECT_DEPENDENCY_FIELDS : LIBRARY_DEPENDENCY_FIELDS;
  return dependencyNames(folder, fields).flatMap((name) => {
    const dependency = installedFolder(name, folder);
    return dependency !== undefined && isWorkspaceFolder(dependency, start, repository)
      ? [dependency]
      : [];
  });
}

export function workspaceDependencyFolders(projectRoot: string): string[] {
  const start = resolvedFolder(path.resolve(projectRoot));
  const walk = { start, repository: repositoryOf(start) };
  const reached = new Set([start]);
  for (const folder of reached) {
    for (const dependency of dependencyFolders(folder, walk)) {
      reached.add(dependency);
    }
  }
  return [...reached];
}

export function programReachRoots(projectRoot: string): string[] {
  return outermost([
    ...typecheckProgramRoots(projectRoot).map(resolvedFolder),
    ...workspaceDependencyFolders(projectRoot),
  ]);
}

export function holdsProgram(projectRoot: string): boolean {
  return (
    existsSync(path.join(projectRoot, PROJECT_TSCONFIG)) ||
    coveringAncestorTsconfig(projectRoot) !== undefined
  );
}
