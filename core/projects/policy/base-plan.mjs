import { existsSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { runGit } from '../../diff/git/repository/command.mjs';
import { declaresUvWorkspace } from '../../tooling/uv-workspace.mjs';
import { inspectRepository } from '../plan/inspect.mjs';
import { canChangePlan, isPlanInput, withBaseTree } from './base-tree.mjs';

export const DECLARATION_FILES = [
  CONFIG_FILE_NAME,
  'package.json',
  'pnpm-workspace.yaml',
  'pyproject.toml',
];

function inspectedPlan(inspection) {
  try {
    return { plan: inspectRepository(inspection).plan };
  } catch (error) {
    return { plan: undefined, error };
  }
}

function changedOnDisk(repositoryRoot, mergeBaseSha) {
  const untracked = runGit(repositoryRoot, ['ls-files', '--others', '--exclude-standard']);
  const addedOrDeleted = runGit(repositoryRoot, [
    'diff',
    '--name-only',
    '--no-renames',
    '--diff-filter=AD',
    mergeBaseSha,
  ]);
  return `${untracked}\n${addedOrDeleted}`.split('\n').filter(Boolean);
}

export function planInputsChanged({ repositoryRoot, mergeBaseSha, changed }) {
  return (
    changed.some(isPlanInput) || changedOnDisk(repositoryRoot, mergeBaseSha).some(canChangePlan)
  );
}

function atRepository(error, { tree, repositoryRoot }) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(message.replaceAll(tree, repositoryRoot), { cause: error });
}

function underPrefix(files, prefix) {
  if (prefix === '.') {
    return files;
  }
  return files
    .filter((file) => file.startsWith(`${prefix}/`))
    .map((file) => file.slice(prefix.length + 1));
}

export function basePlanOf({ repositoryRoot, prefix, mergeBaseSha }) {
  return withBaseTree({ repositoryRoot, mergeBaseSha }, ({ root: tree, files }) => {
    const root = prefix === '.' ? tree : path.resolve(tree, prefix);
    if ((root !== tree && !root.startsWith(tree + path.sep)) || !existsSync(root)) {
      return { plan: undefined };
    }
    const inspected = inspectedPlan({
      root,
      files: underPrefix(files, prefix),
      repositoryRoot: tree,
    });
    return inspected.error === undefined
      ? inspected
      : { plan: undefined, error: atRepository(inspected.error, { tree, repositoryRoot }) };
  });
}

function baseText(repositoryRoot, sha, file) {
  return runGit(repositoryRoot, ['show', `${sha}:${file}`]);
}

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

export function baseDeclaresProjects({ repositoryRoot, prefix, mergeBaseSha }) {
  const folder = prefix === '.' ? '' : `${prefix}/`;
  const listing = ['ls-tree', '--name-only', mergeBaseSha, ...(folder === '' ? [] : [folder])];
  const present = runGit(repositoryRoot, listing)
    .split('\n')
    .map((entry) => entry.slice(folder.length));
  return DECLARATION_FILES.filter((file) => present.includes(file)).some((file) =>
    DECLARES[file](baseText(repositoryRoot, mergeBaseSha, `${folder}${file}`)),
  );
}
