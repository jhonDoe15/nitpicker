import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

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

export function readRenameMap({ repositoryRoot, mergeBaseSha, headSha, projectRelativePath }) {
  const output = runGit(repositoryRoot, [
    'diff',
    '--find-renames',
    '--name-status',
    '-z',
    `${mergeBaseSha}...${headSha}`,
    '--',
    projectRelativePath,
  ]);
  const fields = output.split('\0');
  const renames = new Map();
  const normalizedProjectPath = normalizeGitPath(projectRelativePath).replace(/\/$/, '');

  for (let index = 0; index < fields.length;) {
    const status = fields[index];
    index += 1;
    if (status.length === 0) {
      continue;
    }

    const oldPath = fields[index];
    index += 1;
    if (oldPath === undefined) {
      throw new Error('Malformed git rename output: missing changed path');
    }

    if (!status.startsWith('R')) {
      continue;
    }

    const newPath = fields[index];
    index += 1;
    if (newPath === undefined) {
      throw new Error('Malformed git rename output: missing rename destination');
    }

    renames.set(
      relativeToProject(oldPath, normalizedProjectPath),
      relativeToProject(newPath, normalizedProjectPath),
    );
  }

  return renames;
}

/**
 * The lines each file has on the head side that differ from the merge base, as
 * `Map<path, { path, added, ranges }>` with 1-based inclusive `[start, end]` line ranges. A new
 * file has `added: true`. A pure rename or move without content changes has no hunks and is not
 * listed.
 */
export function readChangedLines({ repositoryRoot, mergeBaseSha, headSha, projectRelativePath }) {
  const output = runGit(repositoryRoot, [
    '-c',
    'core.quotePath=false',
    'diff',
    '--unified=0',
    '--find-renames',
    '--no-color',
    '--no-ext-diff',
    `${mergeBaseSha}...${headSha}`,
    '--',
    projectRelativePath,
  ]);
  return parseChangedLines(output, normalizeGitPath(projectRelativePath).replace(/\/$/, ''));
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
