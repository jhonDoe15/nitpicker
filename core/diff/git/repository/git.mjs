import { runGit } from './command.mjs';
import { mkdtempSync, existsSync, copyFileSync, rmSync, statSync, utimesSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

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
    const isShallow =
      runGit(repositoryRoot, ['rev-parse', '--is-shallow-repository']).trim() === 'true';
    const fetchCommand = fetchSuggestion(repositoryRoot, requestedBaseRef, isShallow);
    throw new Error(
      `Cannot resolve base ref "${requestedBaseRef}". Run \`${fetchCommand}\` and retry.`,
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

export function captureWorkingTree(repositoryRoot, headSha) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-index-'));
  try {
    const indexPath = path.resolve(
      repositoryRoot,
      runGit(repositoryRoot, ['rev-parse', '--git-path', 'index']).trim(),
    );
    const temporaryIndexPath = path.join(temporaryRoot, 'index');
    if (existsSync(indexPath)) {
      const { atimeNs, mtimeNs } = statSync(indexPath, { bigint: true });
      copyFileSync(indexPath, temporaryIndexPath);
      utimesSync(temporaryIndexPath, wholeSeconds(atimeNs), wholeSeconds(mtimeNs));
    }
    const environment = { GIT_INDEX_FILE: temporaryIndexPath };
    runGit(repositoryRoot, ['add', '--all', '--', ':/'], { environment });
    const treeSha = runGit(repositoryRoot, ['write-tree'], { environment }).trim();
    return commitTreeOverHead(repositoryRoot, treeSha, headSha);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

export function commitTreeOverHead(repositoryRoot, treeSha, headSha) {
  if (treeSha === runGit(repositoryRoot, ['rev-parse', `${headSha}^{tree}`]).trim()) {
    return headSha;
  }
  return runGit(
    repositoryRoot,
    ['commit-tree', treeSha, '-p', headSha, '-m', 'nitpicker working tree'],
    { environment: CAPTURE_IDENTITY },
  ).trim();
}

function wholeSeconds(nanoseconds) {
  return Number(nanoseconds / 1_000_000_000n);
}

const CAPTURE_IDENTITY = {
  GIT_AUTHOR_NAME: 'nitpicker',
  GIT_AUTHOR_EMAIL: 'nitpicker@localhost',
  GIT_COMMITTER_NAME: 'nitpicker',
  GIT_COMMITTER_EMAIL: 'nitpicker@localhost',
};

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
