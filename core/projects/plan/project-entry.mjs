import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { presetToDeclare } from '../../configuration/project-checks/preset-detection.mjs';
import { parseConfigFile } from '../../configuration/layers/layers.mjs';
import { readLayeredConfig } from '../../configuration/layers/read-layered.mjs';
import { sharedConfigFiles } from '../../configuration/layers/shared-files.mjs';
import { isInside } from '../discovery/repository-files.mjs';

const ROOT_REPORT_FOLDER = '_root';

function projectsOf(file, label) {
  try {
    return { projects: parseConfigFile(file, label)?.projects };
  } catch {
    return { projects: undefined, unreadable: true };
  }
}

function rejectNestedProjects(entry, root) {
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

export function rejectReportFolderClash(entries) {
  const paths = entries.map((entry) => entry.path);
  if (paths.includes('.') && paths.some((folder) => folder.split('/')[0] === ROOT_REPORT_FOLDER)) {
    throw new Error(
      `The projects include the repository root and ${ROOT_REPORT_FOLDER}, but the reports of the root ` +
        `project are written to <output>/${ROOT_REPORT_FOLDER}. Rename the ${ROOT_REPORT_FOLDER} folder, ` +
        'or leave the root out of "projects"',
    );
  }
}

function nestedExcludes(entry, allPaths) {
  return allPaths
    .filter((other) => other !== entry.path && isInside(other, entry.path))
    .map((other) => {
      const relative = entry.path === '.' ? other : other.slice(entry.path.length + 1);
      return `${relative}/**`;
    });
}

const SCRIPT_PRESETS = new Set(['typescript', 'javascript']);
const WEB_SOURCE_FOLDERS = ['src/main/webapp', 'src/main/frontend', 'frontend'];

function companionSettings(entry, { absolute, companion }) {
  if (!companion || !SCRIPT_PRESETS.has(entry.preset) || entry.settings?.layout !== undefined) {
    return entry.settings;
  }
  const sourceRoots = WEB_SOURCE_FOLDERS.filter((folder) =>
    existsSync(path.join(absolute, folder)),
  );
  return sourceRoots.length === 0
    ? entry.settings
    : { ...entry.settings, layout: { sourceRoots, testRoots: sourceRoots } };
}

function overlayOf(entry, { absolute, root, excludes, companion }) {
  const preset = entry.preset === undefined ? presetToDeclare({}, absolute)?.preset : entry.preset;
  const declared = entry.preset !== undefined;
  const inherits =
    entry.path === '.' ? undefined : path.relative(absolute, root).split(path.sep).join('/');
  const settings = companionSettings(entry, { absolute, companion });
  const extra = {
    ...(companion ? { companion } : {}),
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
    ...(preset === undefined ? {} : { preset, declared }),
    ...(excludes.length === 0 ? {} : { exclude: excludes }),
    ...(inherits === undefined ? {} : { inherits }),
    ...extra,
  };
}

function sharedFilesOf(absolute, repositoryRoot) {
  return sharedConfigFiles(absolute, { repositoryRoot }).map(({ file }) =>
    path.relative(repositoryRoot, file).split(path.sep).join('/'),
  );
}

function loadSettings(absolute, overlay, repositoryRoot) {
  try {
    return { config: readLayeredConfig(absolute, { overlay, repositoryRoot }) };
  } catch (error) {
    return {
      config: undefined,
      configError: error instanceof Error ? error.message : String(error),
    };
  }
}

function rejectOtherBase(entry, config, rootConfig) {
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

export function describeProject(entry, context) {
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

export function reportFolder(projectPath) {
  if (projectPath === '.') {
    return ROOT_REPORT_FOLDER;
  }
  return projectPath.startsWith('.@')
    ? `${ROOT_REPORT_FOLDER}${projectPath.slice(1)}`
    : projectPath;
}
