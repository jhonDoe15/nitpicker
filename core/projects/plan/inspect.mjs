import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { SUPPORTED_PRESETS } from '../../configuration/validate.mjs';
import { parseConfigFile, repositoryRootOf } from '../../configuration/layers/layers.mjs';
import { readLayeredConfig } from '../../configuration/layers/read-layered.mjs';
import { validateProjects } from '../../configuration/layers/settings.mjs';
import { resolveDeclaredProjects } from '../discovery/declared-projects.mjs';
import { detectProjects, undeclaredProjects } from '../discovery/detect.mjs';
import { listRepositoryFiles, listSubmodules } from '../discovery/repository-files.mjs';
import { describeProject, rejectReportFolderClash } from './project-entry.mjs';

function declaredEntries(root) {
  const file = path.join(root, CONFIG_FILE_NAME);
  const projects = existsSync(file) ? parseConfigFile(file, CONFIG_FILE_NAME)?.projects : undefined;
  return projects === undefined ? undefined : validateProjects(projects, SUPPORTED_PRESETS);
}

function detectionConfig(root, repositoryRoot) {
  try {
    return { config: readLayeredConfig(root, { repositoryRoot }) };
  } catch (error) {
    return { config: {}, error };
  }
}

function entriesOf({ root, files, repositoryRoot, submodules }) {
  const declared = declaredEntries(root);
  if (declared !== undefined) {
    return declared.length === 0
      ? { optedOut: true }
      : {
          source: 'declared',
          entries: resolveDeclaredProjects({ root, entries: declared, files, submodules }),
        };
  }
  const rootConfig = detectionConfig(root, repositoryRoot).config;
  const detected = detectProjects({ root, rootConfig, files, submodules });
  return detected.multiple ? { source: 'detected', entries: detected.entries } : {};
}

function monorepoPlan({ root, files, found, repositoryRoot, submodules }) {
  const rootConfig = readLayeredConfig(root, { repositoryRoot });
  const prefix = path.relative(repositoryRoot, root).split(path.sep).join('/') || '.';
  rejectReportFolderClash(found.entries);
  const allPaths = [...new Set(found.entries.map((entry) => entry.folder ?? entry.path))];
  const context = { root, repositoryRoot, prefix, rootConfig, allPaths };
  const projects = found.entries.map((entry) => describeProject(entry, context));
  return {
    root,
    repositoryRoot,
    prefix,
    rootConfig,
    source: found.source,
    projects,
    submodules,
    undeclared:
      found.source === 'detected'
        ? undeclaredProjects({ root, files, projects, exclude: rootConfig.exclude })
        : [],
  };
}

function submodulesUnder(root, repositoryRoot) {
  const prefix = path.relative(repositoryRoot, root).split(path.sep).join('/');
  return listSubmodules(repositoryRoot).flatMap((submodule) => {
    if (prefix === '') {
      return [submodule];
    }
    return submodule.startsWith(`${prefix}/`) ? [submodule.slice(prefix.length + 1)] : [];
  });
}

export function inspectRepository({
  root,
  files = listRepositoryFiles(root),
  repositoryRoot = repositoryRootOf(root),
}) {
  const submodules = submodulesUnder(root, repositoryRoot);
  const found = entriesOf({ root, files, repositoryRoot, submodules });
  if (found.entries === undefined) {
    if (found.optedOut === true) {
      return { files, undeclared: [] };
    }
    const { exclude } = detectionConfig(root, repositoryRoot).config;
    return { files, undeclared: undeclaredProjects({ root, files, projects: [], exclude }) };
  }
  return { files, plan: monorepoPlan({ root, files, found, repositoryRoot, submodules }) };
}

export function planMonorepo({ root }) {
  return inspectRepository({ root }).plan;
}
