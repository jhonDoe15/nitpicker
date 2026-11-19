import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  hasScriptSources,
  scriptProjectPreset,
} from '../../configuration/project-checks/preset-detection.mts';
import { CONFIG_FILE_NAME, configError as untypedConfigError } from '../../../shared/config.mjs';
import { globMatcher as untypedGlobMatcher } from '../../../shared/paths/glob.mjs';
import { angularWorkspace, javascriptWorkspaces, nxWorkspace } from './javascript-workspaces.mts';
import { JVM_MARKERS, gradleComposite, jvmBuilds } from './jvm-builds.mts';
import { PYTHON_MARKERS, PYTHON_PROJECT_MARKERS, pythonWorkspace } from './python-projects.mts';
import type { NitpickerConfig } from '../../../shared/values/config-types.mts';
import type { DetectedProjects, WorkspaceDeclaration, WorkspaceMember } from '../project-types.mts';
import {
  directoriesWith,
  isInside,
  isSkippedLocation,
  listRepositoryFiles,
  outermost,
} from './repository-files.mts';

type Matcher = { test(path: string): boolean };
const globMatcher: (glob: string) => Matcher = untypedGlobMatcher;
const configError: (message: string) => Error = untypedConfigError;

const MANIFEST = 'package.json';

const ROOT_SOURCES_ORIGIN = 'repository root sources';

function rootJavascript(root: string, rootConfig: NitpickerConfig): WorkspaceMember[] {
  return existsSync(path.join(root, MANIFEST)) && hasScriptSources(rootConfig, root)
    ? [{ path: '.', origin: ROOT_SOURCES_ORIGIN }]
    : [];
}

function unique(entries: readonly WorkspaceMember[]): WorkspaceMember[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const fresh = !seen.has(entry.path);
    seen.add(entry.path);
    return fresh;
  });
}

function sortKey(entry: WorkspaceMember): string {
  return entry.path === '.' ? '' : entry.path;
}

function byPath(left: WorkspaceMember, right: WorkspaceMember): number {
  return sortKey(left).localeCompare(sortKey(right), 'en', { numeric: true });
}

function nestedPython(directories: readonly string[]): WorkspaceMember[] {
  return outermost(
    directories.filter((directory) => directory !== '.' && !isSkippedLocation(directory)),
  ).map((directory) => ({ path: directory, origin: 'Python project' }));
}

const SCRIPT_ORIGINS: Readonly<Record<string, string>> = {
  typescript: 'TypeScript package',
  javascript: 'JavaScript package',
};

function nestedScripts(root: string, directories: readonly string[]): WorkspaceMember[] {
  return outermost(
    directories.filter((directory) => directory !== '.' && !isSkippedLocation(directory)),
  ).flatMap((directory) => {
    const preset = scriptProjectPreset({}, path.join(root, directory));
    const origin = preset === undefined ? undefined : SCRIPT_ORIGINS[preset];
    return origin === undefined ? [] : [{ path: directory, origin }];
  });
}

function candidatesOf(root: string, files: readonly string[]): WorkspaceMember[] {
  const python = nestedPython(directoriesWith(root, files, PYTHON_PROJECT_MARKERS));
  const jvm = jvmBuilds(root, directoriesWith(root, files, JVM_MARKERS)).filter(
    (build) => build.path !== '.',
  );
  const scripts = nestedScripts(root, directoriesWith(root, files, [MANIFEST]));
  return [...python, ...jvm, ...scripts];
}

function isExcludedFolder(folder: string, exclude: readonly string[]): boolean {
  const inside = `${folder}/project-file`;
  return exclude.some((glob) => globMatcher(glob).test(inside));
}

export function undeclaredProjects({
  root,
  files,
  projects,
  exclude = [],
}: {
  readonly root: string;
  readonly files: readonly string[];
  readonly projects: readonly { readonly path: string }[];
  readonly exclude?: readonly string[] | undefined;
}): WorkspaceMember[] {
  const covering = projects.filter((project) => project.path !== '.');
  return candidatesOf(root, files)
    .filter((candidate) => !covering.some((project) => isInside(candidate.path, project.path)))
    .filter((candidate) => !isExcludedFolder(candidate.path, exclude))
    .toSorted(byPath);
}

function workspacesOf(
  root: string,
  files: readonly string[],
  submodules: readonly string[],
): WorkspaceDeclaration[] {
  const nxProjects = directoriesWith(root, files, ['project.json']).filter(
    (directory) => !isSkippedLocation(directory),
  );
  function withSubmodules(directories: readonly string[]): string[] {
    return [...new Set([...directories, ...submodules])];
  }
  return [
    javascriptWorkspaces(root, withSubmodules(directoriesWith(root, files, [MANIFEST]))),
    nxWorkspace(root, nxProjects),
    angularWorkspace(root),
    gradleComposite(root),
    pythonWorkspace(root, withSubmodules(directoriesWith(root, files, PYTHON_MARKERS))),
  ];
}

function rejectSubmoduleMembers(
  members: readonly WorkspaceMember[],
  submodules: readonly string[],
): void {
  const covered = members.find(({ path: member }) => submodules.includes(member));
  if (covered !== undefined) {
    throw configError(
      `The ${covered.origin} cover ${covered.path}, a Git submodule, which nitpicker does not gate ` +
        `from the repository around it. List the other projects in "projects" of ${CONFIG_FILE_NAME}, ` +
        `and run nitpicker inside ${covered.path} for its own changes`,
    );
  }
}

export function detectProjects({
  root,
  rootConfig = {},
  files = listRepositoryFiles(root),
  submodules = [],
}: {
  readonly root: string;
  readonly rootConfig?: NitpickerConfig | undefined;
  readonly files?: readonly string[] | undefined;
  readonly submodules?: readonly string[] | undefined;
}): DetectedProjects {
  const workspaces = workspacesOf(root, files, submodules);
  rejectSubmoduleMembers(
    workspaces.flatMap((workspace) => workspace.members),
    submodules,
  );
  const declared = workspaces.some((workspace) => workspace.declared);
  const members = unique(workspaces.flatMap((workspace) => workspace.members));
  const multiple = declared && members.some((entry) => entry.path !== '.');
  const entries = multiple
    ? unique([...rootJavascript(root, rootConfig), ...members]).toSorted(byPath)
    : [];
  return { declared, entries, multiple };
}
