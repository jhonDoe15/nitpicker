import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { SUPPORTED_PRESETS } from '../../configuration/validate.mjs';
import { parseConfigFile, repositoryRootOf } from '../../configuration/layers/layers.mjs';
import { readLayeredConfig } from '../../configuration/layers/read-layered.mjs';
import { validateProjects } from '../../configuration/layers/settings.mjs';
import { resolveDeclaredProjects } from '../discovery/declared-projects.mjs';
import { detectProjects, undeclaredProjects } from '../discovery/detect.mjs';
import { listRepositoryFiles } from '../discovery/repository-files.mjs';
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

function entriesOf({ root, files, repositoryRoot }) {
  const declared = declaredEntries(root);
  if (declared !== undefined) {
    return declared.length === 0
      ? { optedOut: true }
      : {
          source: 'declared',
          entries: resolveDeclaredProjects({ root, entries: declared, files }),
        };
  }
  const rootConfig = detectionConfig(root, repositoryRoot).config;
  const detected = detectProjects({ root, rootConfig, files });
  return detected.multiple ? { source: 'detected', entries: detected.entries } : {};
}

function monorepoPlan({ root, files, found, repositoryRoot = repositoryRootOf(root) }) {
  const rootConfig = readLayeredConfig(root, { repositoryRoot });
  const prefix = path.relative(repositoryRoot, root).split(path.sep).join('/') || '.';
  rejectReportFolderClash(found.entries);
  const allPaths = found.entries.map((entry) => entry.path);
  const context = { root, repositoryRoot, prefix, rootConfig, allPaths };
  const projects = found.entries.map((entry) => describeProject(entry, context));
  return {
    root,
    repositoryRoot,
    prefix,
    rootConfig,
    source: found.source,
    projects,
    undeclared: found.source === 'detected' ? undeclaredProjects({ root, files, projects }) : [],
  };
}

export function inspectRepository({ root, files = listRepositoryFiles(root), repositoryRoot }) {
  const found = entriesOf({ root, files, repositoryRoot });
  if (found.entries === undefined) {
    return {
      files,
      undeclared: found.optedOut === true ? [] : undeclaredProjects({ root, files, projects: [] }),
    };
  }
  return { files, plan: monorepoPlan({ root, files, found, repositoryRoot }) };
}

export function planMonorepo({ root }) {
  return inspectRepository({ root }).plan;
}
