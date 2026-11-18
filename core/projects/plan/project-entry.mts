import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { presetToDeclare as untypedPresetToDeclare } from '../../configuration/project-checks/preset-detection.mjs';
import { parseConfigFile } from '../../configuration/layers/layers.mjs';
import { fieldOf, messageOf } from '../../../shared/values/readers.mts';
import type { PlanContext, PlanProject, ProjectEntry } from '../project-types.mts';
import type { NitpickerConfig, ProjectOverlay } from '../../../shared/values/config-types.mts';
import { readLayeredConfig } from '../../configuration/layers/read-layered.mts';
import { sharedConfigFiles } from '../../configuration/layers/shared-files.mts';
import { isInside as untypedIsInside } from '../discovery/repository-files.mjs';
import { containedPath as untypedContainedPath } from '../../../shared/paths/contained-path.mjs';

const presetToDeclare: (
  config: NitpickerConfig,
  projectRoot: string,
) => { readonly preset?: string } | undefined = untypedPresetToDeclare;
const containedPath: (
  root: string,
  relative: string,
  options: { readonly outside: (folder: string) => string },
) => string = untypedContainedPath;
const isInside: (directory: string, parent: string) => boolean = untypedIsInside;

const ROOT_REPORT_FOLDER = '_root';

function projectsOf(
  file: string,
  label: string,
): { readonly projects: unknown; readonly unreadable?: true } {
  try {
    return { projects: fieldOf(parseConfigFile(file, label), 'projects') };
  } catch {
    return { projects: undefined, unreadable: true };
  }
}

function rejectNestedProjects(entry: ProjectEntry, root: string): void {
  const file = path.resolve(root, entry.path, CONFIG_FILE_NAME);
  if (!file.startsWith(root + path.sep)) {
    return;
  }
  const label = `${entry.path}/${CONFIG_FILE_NAME}`;
  if (entry.path !== '.' && existsSync(file) && projectsOf(file, label).projects !== undefined) {
    throw new Error(
      `${label} sets "projects", but only the config at the top of the monorepo can list projects`,
    );
  }
}

export function rejectReportFolderClash(entries: readonly ProjectEntry[]): void {
  const paths = entries.map((entry) => entry.path);
  if (paths.includes('.') && paths.some((folder) => folder.split('/')[0] === ROOT_REPORT_FOLDER)) {
    throw new Error(
      `The projects include the repository root and ${ROOT_REPORT_FOLDER}, but the reports of the root ` +
        `project are written to <output>/${ROOT_REPORT_FOLDER}. Rename the ${ROOT_REPORT_FOLDER} folder, ` +
        'or leave the root out of "projects"',
    );
  }
}

function nestedExcludes(entry: ProjectEntry, allPaths: readonly string[]): string[] {
  return allPaths
    .filter((other) => other !== entry.path && isInside(other, entry.path))
    .map((other) => {
      const relative = entry.path === '.' ? other : other.slice(entry.path.length + 1);
      return `${relative}/**`;
    });
}

const SCRIPT_PRESETS = new Set(['typescript', 'javascript']);
export const WEB_SOURCE_FOLDERS = ['src/main/webapp', 'src/main/frontend', 'frontend'];

function companionSettings(
  entry: ProjectEntry,
  { absolute, companion }: { readonly absolute: string; readonly companion: boolean },
): object | undefined {
  const scripted = entry.preset !== undefined && SCRIPT_PRESETS.has(entry.preset);
  if (!companion || !scripted || fieldOf(entry.settings, 'layout') !== undefined) {
    return entry.settings;
  }
  function outside(folder: string): string {
    return `${folder} leaves ${absolute}`;
  }
  const sourceRoots = WEB_SOURCE_FOLDERS.filter((folder) =>
    existsSync(containedPath(absolute, folder, { outside })),
  );
  return sourceRoots.length === 0
    ? entry.settings
    : { ...entry.settings, layout: { sourceRoots, testRoots: sourceRoots } };
}

type OverlayInput = {
  readonly absolute: string;
  readonly root: string;
  readonly excludes: readonly string[];
  readonly companion: boolean;
};

function overlayOf(
  entry: ProjectEntry,
  { absolute, root, excludes, companion }: OverlayInput,
): ProjectOverlay | undefined {
  const preset = entry.preset === undefined ? presetToDeclare({}, absolute)?.preset : entry.preset;
  const declared = entry.preset !== undefined;
  const inherits =
    entry.path === '.' ? undefined : path.relative(absolute, root).split(path.sep).join('/');
  const settings = companionSettings(entry, { absolute, companion });
  const extra = {
    ...(companion ? { companion } : {}),
    ...(entry.later === true ? { repositoryChecks: false as const } : {}),
    ...(settings === undefined ? {} : { settings }),
  };
  if (
    preset === undefined &&
    excludes.length === 0 &&
    inherits === undefined &&
    Object.keys(extra).length === 0
  ) {
    return undefined;
  }
  return {
    ...(preset === undefined ? {} : { preset, ...(declared ? { declared } : {}) }),
    ...(excludes.length === 0 ? {} : { exclude: excludes }),
    ...(inherits === undefined ? {} : { inherits }),
    ...extra,
  };
}

function sharedFilesOf(absolute: string, repositoryRoot: string): string[] {
  return sharedConfigFiles(absolute, { repositoryRoot }).map(({ file }) =>
    path.relative(repositoryRoot, file).split(path.sep).join('/'),
  );
}

function loadSettings(
  absolute: string,
  overlay: ProjectOverlay | undefined,
  repositoryRoot: string,
): { readonly config?: NitpickerConfig; readonly configError?: string } {
  try {
    return { config: readLayeredConfig(absolute, { overlay, repositoryRoot }) };
  } catch (error) {
    return {
      configError: messageOf(error),
    };
  }
}

function rejectOtherBase(
  entry: ProjectEntry,
  config: NitpickerConfig | undefined,
  rootConfig: NitpickerConfig,
): void {
  if (entry.path === '.' || config?.base === undefined || config.base === rootConfig.base) {
    return;
  }
  const root = rootConfig.base === undefined ? 'not set' : `"${rootConfig.base}"`;
  throw new Error(
    `${entry.path}/${CONFIG_FILE_NAME} sets "base": "${config.base}", but a monorepo run compares ` +
      `every project with one base, the one of the root ${CONFIG_FILE_NAME} (${root}) or --base. ` +
      `Remove "base" from ${entry.path}/${CONFIG_FILE_NAME}, or set the same "base" in the root config`,
  );
}

export function describeProject(entry: ProjectEntry, context: PlanContext): PlanProject {
  const { root, repositoryRoot, prefix, rootConfig, allPaths } = context;
  const folder = entry.folder ?? entry.path;
  const located = { ...entry, path: folder };
  rejectNestedProjects(located, root);
  const absolute = folder === '.' ? root : path.join(root, folder);
  const overlay = overlayOf(located, {
    absolute,
    root,
    excludes: nestedExcludes(located, allPaths),
    companion: entry.folder !== undefined,
  });
  const loaded = loadSettings(absolute, overlay, repositoryRoot);
  rejectOtherBase(located, loaded.config, rootConfig);
  return {
    path: entry.path,
    folder,
    absolute,
    repoPath: path.posix.normalize(path.posix.join(prefix, folder)),
    origin: entry.origin,
    overlay,
    preset: loaded.config?.preset ?? overlay?.preset ?? 'typescript',
    ...(entry.workspace === undefined
      ? {}
      : { toolchainRoot: path.posix.normalize(path.posix.join(prefix, entry.workspace)) }),
    sharedFiles: loaded.configError === undefined ? sharedFilesOf(absolute, repositoryRoot) : [],
    ...(loaded.configError === undefined ? {} : { configError: loaded.configError }),
  };
}

export function reportFolder(projectPath: string): string {
  if (projectPath === '.') {
    return ROOT_REPORT_FOLDER;
  }
  return projectPath.startsWith('.@')
    ? `${ROOT_REPORT_FOLDER}${projectPath.slice(1)}`
    : projectPath;
}
