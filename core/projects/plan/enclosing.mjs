import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { chainOf } from '../../../shared/traversal.mjs';
import { runGit } from '../../diff/git/repository/command.mjs';
import { declaresUvWorkspace } from '../../tooling/uv-workspace.mjs';
import { inspectRepository } from './inspect.mjs';

export const DECLARATION_FILES = [
  CONFIG_FILE_NAME,
  'package.json',
  'pnpm-workspace.yaml',
  'pyproject.toml',
];

function parsed(parse, text) {
  try {
    return { value: parse(text) };
  } catch (error) {
    return { value: undefined, error };
  }
}

function listsProjects(text) {
  const projects = parsed(JSON.parse, text).value?.projects;
  return Array.isArray(projects) && projects.length > 0;
}

function hasWorkspaces(text) {
  const workspaces = parsed(JSON.parse, text).value?.workspaces;
  return Array.isArray(workspaces) || Array.isArray(workspaces?.packages);
}

function listsPackages(text) {
  return Array.isArray(parsed(parseYaml, text).value?.packages);
}

const DECLARES = {
  [CONFIG_FILE_NAME]: listsProjects,
  'package.json': hasWorkspaces,
  'pnpm-workspace.yaml': listsPackages,
  'pyproject.toml': declaresUvWorkspace,
};

export function declaresProjects(readText) {
  return DECLARATION_FILES.some((file) => {
    const text = readText(file);
    return text !== undefined && DECLARES[file](text);
  });
}

function textIn(directory) {
  return (file) => {
    const full = path.resolve(directory, file);
    if (!full.startsWith(directory + path.sep)) {
      return undefined;
    }
    return existsSync(full) ? readFileSync(full, 'utf8') : undefined;
  };
}

function enclosingFolders(projectRoot) {
  const top = realpathSync(runGit(projectRoot, ['rev-parse', '--show-toplevel']).trim());
  if (projectRoot === top) {
    return [];
  }
  return chainOf(path.dirname(projectRoot), (directory) =>
    directory === top || path.dirname(directory) === directory
      ? undefined
      : path.dirname(directory),
  );
}

export function enclosingMember(directory) {
  const projectRoot = realpathSync(directory);
  const root = enclosingFolders(projectRoot).find((folder) => declaresProjects(textIn(folder)));
  if (root === undefined) {
    return undefined;
  }
  const inspection = inspectRepository({ root });
  const member = inspection.plan?.projects.find(({ absolute }) => absolute === projectRoot);
  return member === undefined ? undefined : { ...inspection, member };
}
