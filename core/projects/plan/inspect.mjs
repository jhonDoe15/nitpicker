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

function detectionConfig(root) {
  try {
    return { config: readLayeredConfig(root) };
  } catch (error) {
    return { config: {}, error };
  }
}

function entriesOf({ root, files }) {
  const declared = declaredEntries(root);
  if (declared !== undefined) {
    return declared.length === 0
      ? { optedOut: true }
      : {
          source: 'declared',
          entries: resolveDeclaredProjects({ root, entries: declared, files }),
        };
  }
  const detected = detectProjects({ root, rootConfig: detectionConfig(root).config, files });
  return detected.multiple ? { source: 'detected', entries: detected.entries } : {};
}

function monorepoPlan({ root, files, found }) {
  const rootConfig = readLayeredConfig(root);
  const repositoryRoot = repositoryRootOf(root);
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

export function inspectRepository({ root }) {
  const files = listRepositoryFiles(root);
  const found = entriesOf({ root, files });
  if (found.entries === undefined) {
    return {
      files,
      undeclared: found.optedOut === true ? [] : undeclaredProjects({ root, files, projects: [] }),
    };
  }
  return { files, plan: monorepoPlan({ root, files, found }) };
}

export function planMonorepo({ root }) {
  return inspectRepository({ root }).plan;
}
