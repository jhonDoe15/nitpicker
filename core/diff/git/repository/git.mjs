import { listRemotes, runGit } from './command.mjs';
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
    const advice = fetchAdvice(repositoryRoot, requestedBaseRef);
    throw new Error(`Cannot resolve base ref "${requestedBaseRef}". ${advice}`, { cause: error });
  }

  const headSha = runGit(repositoryRoot, ['rev-parse', 'HEAD^{commit}']).trim();
  try {
    const mergeBaseSha = runGit(repositoryRoot, ['merge-base', headSha, resolvedBase]).trim();
    if (mergeBaseSha.length === 0) {
      throw new Error('git merge-base returned no commit');
    }
    return { requestedBaseRef, resolvedBaseSha: resolvedBase, mergeBaseSha, headSha };
  } catch (error) {
    const advice = fetchAdvice(repositoryRoot, requestedBaseRef);
    throw new Error(`Cannot find a merge base between HEAD and "${requestedBaseRef}". ${advice}`, {
      cause: error,
    });
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

export function hasSameTree(repositoryRoot, leftSha, rightSha) {
  const [leftTree, rightTree] = runGit(repositoryRoot, [
    'rev-parse',
    `${leftSha}^{tree}`,
    `${rightSha}^{tree}`,
  ])
    .trim()
    .split('\n');
  return leftTree === rightTree;
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

function fetchAdvice(repositoryRoot, requestedBaseRef) {
  const remotes = listRemotes(repositoryRoot);
  const separator = requestedBaseRef.indexOf('/');
  const requestedRemote = separator === -1 ? undefined : requestedBaseRef.slice(0, separator);
  const remote =
    requestedRemote !== undefined && remotes.includes(requestedRemote) ? requestedRemote : 'origin';
  if (!remotes.includes(remote)) {
    return missingRemoteAdvice(remotes, requestedRemote);
  }
  const remoteBranch =
    requestedRemote === remote ? requestedBaseRef.slice(separator + 1) : requestedBaseRef;
  const isShallow =
    runGit(repositoryRoot, ['rev-parse', '--is-shallow-repository']).trim() === 'true';
  const fetchCommand = isShallow
    ? `git fetch --unshallow ${shellQuote(remote)} ${shellQuote(remoteBranch)}`
    : `git fetch ${shellQuote(remote)} ${shellQuote(remoteBranch)}`;
  return `Run \`${fetchCommand}\` and retry.`;
}

function missingRemoteAdvice(remotes, requestedRemote) {
  if (remotes.length === 0) {
    return [
      'The repository has no remote to fetch it from:',
      'pass a local branch, tag or commit that HEAD shares history with.',
    ].join(' ');
  }
  const named =
    requestedRemote === undefined || requestedRemote === 'origin'
      ? '"origin"'
      : `"${requestedRemote}" or "origin"`;
  const listed = remotes.join(', ');
  return `No remote is named ${named} (remotes: ${listed}). Fetch the branch from one and retry.`;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
