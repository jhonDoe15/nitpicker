import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseYaml } from '../../tooling/yaml/yaml-documents.mts';
import { isNonEmptyString } from '../../../shared/config.mts';
import { fieldOf, fieldsOf } from '../../../shared/values/readers.mts';
import type { WorkspaceDeclaration } from '../project-types.mts';
import { globMatcher as untypedGlobMatcher } from '../../../shared/paths/glob.mts';

type Matcher = { test(path: string): boolean };
const globMatcher: (glob: string) => Matcher = untypedGlobMatcher;

const MANIFEST_ORIGIN = 'package.json workspaces';
const PNPM_ORIGIN = 'pnpm-workspace.yaml';

function readText(
  file: string,
  parse: (text: string) => unknown,
): { readonly value: unknown; readonly unreadable?: true } {
  if (!existsSync(file)) {
    return { value: undefined };
  }
  try {
    return { value: parse(readFileSync(file, 'utf8')) };
  } catch {
    return { value: undefined, unreadable: true };
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => isNonEmptyString(entry))
    : [];
}

function manifestPatterns(root: string): string[] {
  const workspaces = fieldOf(
    readText(path.join(root, 'package.json'), JSON.parse).value,
    'workspaces',
  );
  return stringList(Array.isArray(workspaces) ? workspaces : fieldOf(workspaces, 'packages'));
}

function pnpmPatterns(root: string): string[] {
  return stringList(
    fieldOf(readText(path.join(root, 'pnpm-workspace.yaml'), parseYaml).value, 'packages'),
  );
}

function folderPattern(pattern: string): string {
  return pattern.replace(/^\.\//u, '').replace(/\/+$/u, '');
}

function matchersOf(patterns: readonly string[]) {
  return patterns.map((pattern) => globMatcher(folderPattern(pattern)));
}

export function workspaceMembers(
  patterns: readonly string[],
  directories: readonly string[],
): string[] {
  const included = matchersOf(patterns.filter((pattern) => !pattern.startsWith('!')));
  const excluded = matchersOf(
    patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1)),
  );
  return directories.filter(
    (directory) =>
      directory !== '.' &&
      included.some((matcher) => matcher.test(directory)) &&
      !excluded.some((matcher) => matcher.test(directory)),
  );
}

export function javascriptWorkspaces(
  root: string,
  packageDirectories: readonly string[],
): WorkspaceDeclaration {
  const candidates: [string, string[]][] = [
    [PNPM_ORIGIN, pnpmPatterns(root)],
    [MANIFEST_ORIGIN, manifestPatterns(root)],
  ];
  const sources = candidates.filter(([, patterns]) => patterns.length > 0);
  const members = new Map<string, string>();
  for (const [origin, patterns] of sources) {
    for (const directory of workspaceMembers(patterns, packageDirectories)) {
      members.set(directory, members.get(directory) ?? origin);
    }
  }
  return {
    declared: sources.length > 0,
    members: [...members].map(([directory, origin]) => ({ path: directory, origin })),
  };
}

const NX_ORIGIN = 'Nx project.json';
const ANGULAR_ORIGIN = 'angular.json';

function workspaceFolder(folder: unknown): string {
  return typeof folder === 'string' ? folder.replace(/^\.\//u, '').replace(/\/+$/u, '') : '';
}

export function nxWorkspace(
  root: string,
  projectDirectories: readonly string[],
): WorkspaceDeclaration {
  if (!existsSync(path.join(root, 'nx.json'))) {
    return { declared: false, members: [] };
  }
  const members = projectDirectories.filter((directory) => directory !== '.');
  return {
    declared: members.length > 0,
    members: members.map((directory) => ({ path: directory, origin: NX_ORIGIN })),
  };
}

function existsInside(root: string, folder: string): boolean {
  const full = path.resolve(root, folder);
  if (!full.startsWith(`${path.resolve(root)}${path.sep}`)) {
    return false;
  }
  return existsSync(full);
}

export function angularWorkspace(root: string): WorkspaceDeclaration {
  const projects = fieldOf(readText(path.join(root, 'angular.json'), JSON.parse).value, 'projects');
  const folders = Object.values(fieldsOf(projects))
    .map((project) => workspaceFolder(fieldOf(project, 'root')))
    .filter((folder) => folder !== '' && existsInside(root, folder));
  return {
    declared: folders.length > 0,
    members: [...new Set(folders)].map((folder) => ({ path: folder, origin: ANGULAR_ORIGIN })),
  };
}
