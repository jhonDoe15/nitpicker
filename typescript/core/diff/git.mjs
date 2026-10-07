import { spawnSync } from 'node:child_process';
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

export function runGit(repositoryRoot, args) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
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
