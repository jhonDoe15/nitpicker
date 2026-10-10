import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scopeMoves } from './renames.mjs';

export class GitCommandError extends Error {
  constructor({ args, cwd, result }) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    super(`git ${args.join(' ')} failed in ${cwd}: ${detail}`);
    this.name = 'GitCommandError';
    this.args = args;
    this.cwd = cwd;
    this.exitCode = result.status;
  }
}

export function runGit(repositoryRoot, args, { environment } = {}) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    env: environment === undefined ? process.env : { ...process.env, ...environment },
  });

  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new GitCommandError({ args, cwd: repositoryRoot, result });
  }
  return result.stdout;
}

export function resolveComparison(repositoryRoot, requestedBaseRef) {
  let resolvedBase;
  try {
    resolvedBase = runGit(repositoryRoot, [
      'rev-parse',
      '--verify',
      '--end-of-options',
      `${requestedBaseRef}^{commit}`,
    ]).trim();
  } catch (error) {
    throw new Error(
      `Cannot resolve base ref "${requestedBaseRef}". Fetch it before running the comparison.`,
      { cause: error },
    );
  }

  const headSha = runGit(repositoryRoot, ['rev-parse', 'HEAD^{commit}']).trim();
  try {
    const mergeBaseSha = runGit(repositoryRoot, ['merge-base', headSha, resolvedBase]).trim();
    if (mergeBaseSha.length === 0) {
      throw new Error('git merge-base returned no commit');
    }
    return { requestedBaseRef, resolvedBaseSha: resolvedBase, mergeBaseSha, headSha };
  } catch (error) {
    const isShallow =
      runGit(repositoryRoot, ['rev-parse', '--is-shallow-repository']).trim() === 'true';
    const fetchCommand = fetchSuggestion(repositoryRoot, requestedBaseRef, isShallow);
    throw new Error(
      `Cannot find a merge base between HEAD and "${requestedBaseRef}". Run \`${fetchCommand}\` and retry.`,
      { cause: error },
    );
  }
}

/**
 * Returns a commit whose tree is the checkout, including untracked files that are not ignored. The
 * staging happens in a copy of the index, so the user's index, branches, and files are untouched.
 */
export function captureWorkingTree(repositoryRoot, headSha) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-index-'));
  try {
    const indexPath = path.resolve(
      repositoryRoot,
      runGit(repositoryRoot, ['rev-parse', '--git-path', 'index']).trim(),
    );
    const temporaryIndexPath = path.join(temporaryRoot, 'index');
    if (existsSync(indexPath)) {
      copyFileSync(indexPath, temporaryIndexPath);
    }
    const environment = { GIT_INDEX_FILE: temporaryIndexPath };
    runGit(repositoryRoot, ['add', '--all', '--', ':/'], { environment });
    const treeSha = runGit(repositoryRoot, ['write-tree'], { environment }).trim();
    if (treeSha === runGit(repositoryRoot, ['rev-parse', `${headSha}^{tree}`]).trim()) {
      return headSha;
    }
    return runGit(
      repositoryRoot,
      ['commit-tree', treeSha, '-p', headSha, '-m', 'nitpicker working tree'],
      { environment: CAPTURE_IDENTITY },
    ).trim();
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

const CAPTURE_IDENTITY = {
  GIT_AUTHOR_NAME: 'nitpicker',
  GIT_AUTHOR_EMAIL: 'nitpicker@localhost',
  GIT_COMMITTER_NAME: 'nitpicker',
  GIT_COMMITTER_EMAIL: 'nitpicker@localhost',
};

export function readRepositoryChanges({ repositoryRoot, mergeBaseSha, headSha }) {
  const output = runGit(repositoryRoot, [
    '-c',
    RENAME_LIMIT_SETTING,
    'diff',
    RENAME_DETECTION,
    '--name-status',
    '-z',
    `${mergeBaseSha}...${headSha}`,
  ]);
  return parseNameStatus(output.split('\0'));
}

const RENAME_LIMIT_SETTING = 'diff.renameLimit=20000';
const RENAME_DETECTION = '--find-renames=50%';
const PROJECT_MARKERS = ['nitpicker.config.json', 'package.json'];

function parseNameStatus(fields) {
  const changes = { renames: [], added: new Set(), deleted: new Set() };
  const entry = { status: '', paths: [] };
  for (const field of fields) {
    if (entry.status === '') {
      entry.status = field;
    } else {
      entry.paths.push(field);
    }
    if (entry.paths.length === pathCount(entry.status)) {
      recordChange(changes, entry);
      entry.status = '';
      entry.paths = [];
    }
  }
  if (entry.status !== '') {
    throw new Error('Malformed git rename output: missing changed path');
  }
  return changes;
}

function pathCount(status) {
  if (status === '') {
    return -1;
  }
  return status.startsWith('R') || status.startsWith('C') ? 2 : 1;
}

function recordChange(changes, { status, paths }) {
  const [first, second] = paths.map(normalizeGitPath);
  const recorders = new Map([
    ['R', () => changes.renames.push([first, second])],
    ['A', () => changes.added.add(first)],
    ['D', () => changes.deleted.add(first)],
  ]);
  recorders.get(status[0])?.();
}

export function resolveBaseProjectPath({
  repositoryRoot,
  mergeBaseSha,
  headSha,
  projectRelativePath,
  changes = readRepositoryChanges({ repositoryRoot, mergeBaseSha, headSha }),
}) {
  const headProject = repositoryPath(projectRelativePath);
  const baseLocations = PROJECT_MARKERS.map((marker) => joinRepositoryPath(headProject, marker))
    .filter((headMarker) => existsInCommit(repositoryRoot, headSha, headMarker))
    .map((headMarker) =>
      locateMarkerInBase({
        repositoryRoot,
        mergeBaseSha,
        headMarker,
        projectRelativePath,
        changes,
      }),
    );
  return baseLocations.find((location) => location !== undefined) ?? projectRelativePath;
}

function locateMarkerInBase({
  repositoryRoot,
  mergeBaseSha,
  headMarker,
  projectRelativePath,
  changes,
}) {
  if (existsInCommit(repositoryRoot, mergeBaseSha, headMarker)) {
    return projectRelativePath;
  }
  const moved = changes.renames.find(([, newPath]) => newPath === headMarker);
  return moved === undefined ? undefined : path.posix.dirname(moved[0]);
}

function repositoryPath(projectRelativePath) {
  const normalized = normalizeGitPath(projectRelativePath).replace(/\/$/, '');
  return normalized === '.' ? '' : normalized;
}

function joinRepositoryPath(directory, name) {
  return directory === '' ? name : `${directory}/${name}`;
}

function existsInCommit(repositoryRoot, sha, repositoryRelativePath) {
  try {
    runGit(repositoryRoot, ['cat-file', '-e', `${sha}:${repositoryRelativePath}`]);
    return true;
  } catch (error) {
    if (error instanceof GitCommandError) {
      return false;
    }
    throw error;
  }
}

export function readProjectMoves({
  repositoryRoot,
  mergeBaseSha,
  headSha,
  projectRelativePath,
  baseProjectRelativePath = projectRelativePath,
  changes = readRepositoryChanges({ repositoryRoot, mergeBaseSha, headSha }),
}) {
  return scopeMoves({
    changes,
    baseProjectPath: repositoryPath(baseProjectRelativePath),
    headProjectPath: repositoryPath(projectRelativePath),
  });
}

export function readRenameMap(options) {
  return readProjectMoves(options).files;
}

export function readChangedLines({
  repositoryRoot,
  mergeBaseSha,
  headSha,
  projectRelativePath,
  baseProjectRelativePath = projectRelativePath,
  inferredMoves = new Map(),
}) {
  const headProject = normalizeGitPath(projectRelativePath).replace(/\/$/, '');
  const output = runGit(repositoryRoot, [
    '-c',
    'core.quotePath=false',
    '-c',
    RENAME_LIMIT_SETTING,
    'diff',
    '--unified=0',
    RENAME_DETECTION,
    '--no-color',
    '--no-ext-diff',
    `${mergeBaseSha}...${headSha}`,
    '--',
    ...new Set([projectRelativePath, baseProjectRelativePath]),
  ]);
  const changed = parseChangedLines(onlyFilesInside(output, headProject), headProject);
  for (const [basePath, headPath] of inferredMoves) {
    const movedChanges = readMovedFileChanges({
      repositoryRoot,
      baseSide: `${mergeBaseSha}:${joinRepositoryPath(repositoryPath(baseProjectRelativePath), basePath)}`,
      headSide: `${headSha}:${joinRepositoryPath(repositoryPath(headProject), headPath)}`,
    });
    changed.delete(headPath);
    for (const entry of movedChanges.values()) {
      changed.set(headPath, { ...entry, path: headPath });
    }
  }
  return changed;
}

function readMovedFileChanges({ repositoryRoot, baseSide, headSide }) {
  const output = runGit(repositoryRoot, [
    '-c',
    'core.quotePath=false',
    'diff',
    '--unified=0',
    '--no-color',
    '--no-ext-diff',
    baseSide,
    headSide,
  ]);
  return parseChangedLines(output, '.');
}

function onlyFilesInside(diffText, projectRelativePath) {
  if (projectRelativePath === '.' || projectRelativePath.length === 0) {
    return diffText;
  }
  return diffText
    .split(/^(?=diff --git )/m)
    .filter((section) => sectionIsInside(section, projectRelativePath))
    .join('');
}

function sectionIsInside(section, projectRelativePath) {
  const target = /^\+\+\+ (.+)$/m.exec(section);
  const filePath = target === null ? undefined : diffTargetPath(target[1]);
  return filePath === undefined || normalizeGitPath(filePath).startsWith(`${projectRelativePath}/`);
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

export function parseChangedLines(diffText, projectRelativePath = '.') {
  const changed = new Map();
  let current;
  let isNewFile = false;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = undefined;
      isNewFile = false;
    } else if (line.startsWith('new file mode')) {
      isNewFile = true;
    } else if (line.startsWith('+++ ')) {
      const filePath = diffTargetPath(line.slice(4));
      current =
        filePath === undefined
          ? undefined
          : {
              path: relativeToProject(filePath, projectRelativePath),
              added: isNewFile,
              ranges: [],
            };
      if (current !== undefined) {
        changed.set(current.path, current);
      }
    } else if (current !== undefined) {
      const hunk = HUNK_HEADER.exec(line);
      if (hunk !== null) {
        const start = Number(hunk[1]);
        const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
        if (count > 0) {
          current.ranges.push([start, start + count - 1]);
        }
      }
    }
  }
  return changed;
}

function diffTargetPath(target) {
  const unquoted = target.startsWith('"') ? JSON.parse(target) : target.replace(/\t.*$/, '');
  if (unquoted === '/dev/null') {
    return undefined;
  }
  return unquoted.replace(/^b\//, '');
}

function fetchSuggestion(repositoryRoot, requestedBaseRef, isShallow) {
  const remotes = new Set(
    runGit(repositoryRoot, ['remote'])
      .split(/\r?\n/)
      .filter((remote) => remote.length > 0),
  );
  const separator = requestedBaseRef.indexOf('/');
  const requestedRemote = separator === -1 ? undefined : requestedBaseRef.slice(0, separator);
  const remote =
    requestedRemote !== undefined && remotes.has(requestedRemote) ? requestedRemote : 'origin';
  const remoteBranch =
    requestedRemote === remote ? requestedBaseRef.slice(separator + 1) : requestedBaseRef;
  return isShallow
    ? `git fetch --unshallow ${shellQuote(remote)} ${shellQuote(remoteBranch)}`
    : `git fetch ${shellQuote(remote)} ${shellQuote(remoteBranch)}`;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function relativeToProject(filePath, projectRelativePath) {
  const normalizedPath = normalizeGitPath(filePath);
  if (projectRelativePath === '.' || projectRelativePath.length === 0) {
    return normalizedPath;
  }
  const prefix = `${projectRelativePath}/`;
  if (!normalizedPath.startsWith(prefix)) {
    throw new Error(`Git returned path outside project root: ${normalizedPath}`);
  }
  return normalizedPath.slice(prefix.length);
}

export function normalizeGitPath(value) {
  return path.posix.normalize(value.replaceAll('\\', '/')).replace(/^\.\//, '');
}
