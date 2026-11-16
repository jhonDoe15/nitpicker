import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parseYaml as untypedParseYaml } from '../../tooling/yaml/yaml-documents.mjs';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { chainOf as untypedChainOf } from '../../../shared/traversal.mjs';
import { runGit } from '../../diff/git/repository/command.mjs';
import { declaresUvWorkspace as untypedDeclaresUvWorkspace } from '../../configuration/project-checks/uv-workspace.mjs';
import { inspectRepository } from './inspect.mts';
import { fieldOf, fieldsOf } from '../../../shared/values/readers.mts';
import type { Inspection, PlanProject } from '../project-types.mts';

type Parsed = { readonly value: unknown; readonly error?: unknown };
type TextReader = (file: string) => string | undefined;

export type EnclosingMember = Inspection & { readonly member: PlanProject };

const parseYaml: (text: string) => unknown = untypedParseYaml;
const chainOf: (start: string, next: (current: string) => string | undefined) => string[] =
  untypedChainOf;
const declaresUvWorkspace: (text: string) => boolean = untypedDeclaresUvWorkspace;

export const DECLARATION_FILES = [
  CONFIG_FILE_NAME,
  'package.json',
  'pnpm-workspace.yaml',
  'pyproject.toml',
  'nx.json',
  'angular.json',
  'settings.gradle',
  'settings.gradle.kts',
];

function parsed(parse: (text: string) => unknown, text: string): Parsed {
  try {
    return { value: parse(text) };
  } catch (error) {
    return { value: undefined, error };
  }
}

function listsProjects(text: string): boolean {
  const projects = fieldOf(parsed(JSON.parse, text).value, 'projects');
  return Array.isArray(projects) && projects.length > 0;
}

function hasWorkspaces(text: string): boolean {
  const workspaces = fieldOf(parsed(JSON.parse, text).value, 'workspaces');
  return Array.isArray(workspaces) || Array.isArray(fieldOf(workspaces, 'packages'));
}

function listsPackages(text: string): boolean {
  return Array.isArray(fieldOf(parsed(parseYaml, text).value, 'packages'));
}

function listsAngularProjects(text: string): boolean {
  const projects = fieldsOf(fieldOf(parsed(JSON.parse, text).value, 'projects'));
  return Object.values(projects).some((project) => {
    const root = fieldOf(project, 'root');
    return typeof root === 'string' && root !== '';
  });
}

function includesBuilds(text: string): boolean {
  return /\bincludeBuild\b/u.test(text);
}

const DECLARES: Readonly<Record<string, (text: string) => boolean>> = {
  [CONFIG_FILE_NAME]: listsProjects,
  'package.json': hasWorkspaces,
  'pnpm-workspace.yaml': listsPackages,
  'pyproject.toml': declaresUvWorkspace,
  'nx.json': () => true,
  'angular.json': listsAngularProjects,
  'settings.gradle': includesBuilds,
  'settings.gradle.kts': includesBuilds,
};

export function declaresProjects(readText: TextReader): boolean {
  return DECLARATION_FILES.some((file) => {
    const text = readText(file);
    return text !== undefined && DECLARES[file]?.(text) === true;
  });
}

function textIn(directory: string): TextReader {
  return (file) => {
    const full = path.resolve(directory, file);
    if (!full.startsWith(directory + path.sep)) {
      return undefined;
    }
    return existsSync(full) ? readFileSync(full, 'utf8') : undefined;
  };
}

function enclosingFolders(projectRoot: string): string[] {
  const top = realpathSync(runGit(projectRoot, ['rev-parse', '--show-toplevel']).trim());
  if (projectRoot === top) {
    return [];
  }
  return chainOf(path.dirname(projectRoot), (directory: string) =>
    directory === top || path.dirname(directory) === directory
      ? undefined
      : path.dirname(directory),
  );
}

export function enclosingMember(directory: string): EnclosingMember | undefined {
  const projectRoot = realpathSync(directory);
  const root = enclosingFolders(projectRoot).find((folder) => declaresProjects(textIn(folder)));
  if (root === undefined) {
    return undefined;
  }
  const inspection = inspectRepository({ root });
  const member = inspection.plan?.projects.find(({ absolute }) => absolute === projectRoot);
  return member === undefined ? undefined : { ...inspection, member };
}
