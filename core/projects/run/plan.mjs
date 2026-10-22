import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { runGit } from '../../diff/git/repository/command.mjs';
import { presetToDeclare } from '../../configuration/project-checks/preset-detection.mjs';
import { SUPPORTED_PRESETS } from '../../configuration/validate.mjs';
import { parseConfigFile } from '../../configuration/layers/layers.mjs';
import { readLayeredConfig } from '../../configuration/layers/read-layered.mjs';
import { sharedConfigFiles } from '../../configuration/layers/shared-files.mjs';
import { validateProjects } from '../../configuration/layers/settings.mjs';
import { resolveDeclaredProjects } from '../discovery/declared-projects.mjs';
import { detectProjects } from '../discovery/detect.mjs';
import { listRepositoryFiles } from '../discovery/repository-files.mjs';

function declaredEntries(root) {
  const file = path.join(root, CONFIG_FILE_NAME);
  const projects = existsSync(file) ? parseConfigFile(file, CONFIG_FILE_NAME)?.projects : undefined;
  return projects === undefined ? undefined : validateProjects(projects, SUPPORTED_PRESETS);
}

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

function overlayOf(entry, absolute) {
  if (entry.preset !== undefined) {
    return { preset: entry.preset, declared: true };
  }
  const detected = presetToDeclare({}, absolute)?.preset;
  return detected === undefined ? undefined : { preset: detected, declared: false };
}

function describeProject(entry, context) {
  const { root, repositoryRoot, prefix } = context;
  rejectNestedProjects(entry, root);
  const absolute = path.join(root, entry.path);
  const overlay = overlayOf(entry, absolute);
  const loaded = loadSettings(absolute, overlay, repositoryRoot);
  return {
    path: entry.path,
    absolute,
    repoPath: path.posix.normalize(path.posix.join(prefix, entry.path)),
    origin: entry.origin,
    overlay,
    preset: loaded.config?.preset ?? overlay?.preset ?? 'typescript',
    sharedFiles: loaded.sharedFiles,
  };
}

function loadSettings(absolute, overlay, repositoryRoot) {
  try {
    const config = readLayeredConfig(absolute, { overlay, repositoryRoot });
    const sharedFiles = sharedConfigFiles(absolute).map(({ file }) =>
      path.relative(repositoryRoot, file).split(path.sep).join('/'),
    );
    return { config, sharedFiles };
  } catch {
    return { config: undefined, sharedFiles: [] };
  }
}

function entriesOf({ root, rootConfig, files }) {
  const declared = declaredEntries(root);
  if (declared !== undefined) {
    return declared.length === 0
      ? undefined
      : {
          source: 'declared',
          entries: resolveDeclaredProjects({ root, entries: declared, files }),
        };
  }
  const detected = detectProjects({ root, rootConfig, files });
  return detected.multiple ? { source: 'detected', entries: detected.entries } : undefined;
}

function listedFiles(root) {
  try {
    return { files: listRepositoryFiles(root) };
  } catch {
    return { files: undefined };
  }
}

export function planMonorepo({ root }) {
  const { files } = listedFiles(root);
  if (files === undefined) {
    return undefined;
  }
  const rootConfig = readLayeredConfig(root);
  const found = entriesOf({ root, rootConfig, files });
  if (found === undefined) {
    return undefined;
  }
  const repositoryRoot = realpathSync(runGit(root, ['rev-parse', '--show-toplevel']).trim());
  const prefix = path.relative(repositoryRoot, root).split(path.sep).join('/') || '.';
  return {
    root,
    repositoryRoot,
    prefix,
    rootConfig,
    source: found.source,
    projects: found.entries.map((entry) =>
      describeProject(entry, { root, repositoryRoot, prefix }),
    ),
  };
}
