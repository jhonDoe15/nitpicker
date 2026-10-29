import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { runGit } from '../../diff/git/repository/command.mjs';
import { withTemporaryWorktree } from '../../diff/git/repository/worktree.mjs';
import { inspectRepository } from '../plan/inspect.mjs';

const UV_WORKSPACE_TABLE = /^\s*\[tool\.uv\.workspace\]/mu;
export const DECLARATION_FILES = [
  CONFIG_FILE_NAME,
  'package.json',
  'pnpm-workspace.yaml',
  'pyproject.toml',
];

function inspectedPlan(root) {
  try {
    return { plan: inspectRepository({ root: realpathSync(root) }).plan };
  } catch (error) {
    return { plan: undefined, error };
  }
}

const PLAN_INPUT_NAMES = new Set(['Pipfile', 'setup.py', 'setup.cfg', 'requirements.txt']);
const PLAN_INPUT_EXTENSIONS = new Set([
  '.json',
  '.toml',
  '.yaml',
  '.yml',
  '.gradle',
  '.kts',
  '.xml',
]);

function isPlanInput(file) {
  return (
    PLAN_INPUT_NAMES.has(path.posix.basename(file)) ||
    PLAN_INPUT_EXTENSIONS.has(path.posix.extname(file))
  );
}

export function planInputsChanged({ repositoryRoot, mergeBaseSha, changed }) {
  if (changed.some(isPlanInput)) {
    return true;
  }
  const untracked = runGit(repositoryRoot, ['ls-files', '--others', '--exclude-standard']);
  const addedOrDeleted = runGit(repositoryRoot, [
    'diff',
    '--name-only',
    '--no-renames',
    '--diff-filter=AD',
    mergeBaseSha,
  ]);
  return untracked.trim() !== '' || addedOrDeleted.trim() !== '';
}

function baseRootOf(worktree, prefix) {
  if (prefix === '.') {
    return worktree;
  }
  const full = path.resolve(worktree, prefix);
  if (!full.startsWith(worktree + path.sep)) {
    return undefined;
  }
  return full;
}

export function basePlanOf({ repositoryRoot, prefix, mergeBaseSha }) {
  return withTemporaryWorktree(repositoryRoot, mergeBaseSha, (worktree) => {
    const root = baseRootOf(worktree, prefix);
    return root !== undefined && existsSync(root) ? inspectedPlan(root).plan : undefined;
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

function hasUvWorkspace(text) {
  return UV_WORKSPACE_TABLE.test(text);
}

const DECLARES = {
  [CONFIG_FILE_NAME]: listsProjects,
  'package.json': hasWorkspaces,
  'pnpm-workspace.yaml': listsPackages,
  'pyproject.toml': hasUvWorkspace,
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
