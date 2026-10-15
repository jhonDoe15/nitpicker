import { configError } from '../../shared/config.mjs';
import { GitCommandError, runGit } from './git.mjs';

const COMMIT_ID = /^[0-9a-f]{7,40}$/iu;
const HEAD_SYNTAX = /HEAD|^@|@\{/u;

export function resolveBase({ repositoryRoot, explicitBase, configuredBase, environment = {} }) {
  if (isNonEmpty(explicitBase)) {
    return { baseRef: explicitBase, source: 'argument' };
  }

  const ciTarget = [
    environment.CHANGE_TARGET,
    environment.GITHUB_BASE_REF,
    environment.CI_MERGE_REQUEST_TARGET_BRANCH_NAME,
  ].find(isNonEmpty);
  if (ciTarget !== undefined) {
    return {
      baseRef: ciTarget.startsWith('origin/') ? ciTarget : `origin/${ciTarget}`,
      source: 'ci',
    };
  }

  if (isNonEmpty(configuredBase)) {
    return { baseRef: notCheckedOutCommit(repositoryRoot, configuredBase), source: 'config' };
  }

  const remotes = runGit(repositoryRoot, ['remote'])
    .split(/\r?\n/)
    .filter((remote) => remote.length > 0);
  const remote = remotes.includes('upstream') ? 'upstream' : 'origin';
  const remoteHead = gitOrUndefined(repositoryRoot, [
    'symbolic-ref',
    '--quiet',
    `refs/remotes/${remote}/HEAD`,
  ])?.trim();
  if (remoteHead?.startsWith('refs/remotes/') === true) {
    return { baseRef: remoteHead.slice('refs/remotes/'.length), source: 'remote-head' };
  }

  const fallback = ['origin/main', 'origin/master'].find(
    (ref) =>
      gitOrUndefined(repositoryRoot, [
        'rev-parse',
        '--verify',
        '--quiet',
        `refs/remotes/${ref}^{commit}`,
      ]) !== undefined,
  );
  if (fallback !== undefined) {
    return { baseRef: fallback, source: 'fallback' };
  }

  throw new Error('No base could be determined. Use --base <ref>.');
}

function followsHead(repositoryRoot, configuredBase) {
  if (COMMIT_ID.test(configuredBase) || HEAD_SYNTAX.test(configuredBase)) {
    return true;
  }
  const name = symbolicName(repositoryRoot, configuredBase);
  return name !== undefined && name !== '' && name === symbolicName(repositoryRoot, 'HEAD');
}

function notCheckedOutCommit(repositoryRoot, configuredBase) {
  const base = commitOf(repositoryRoot, configuredBase);
  if (
    base === undefined ||
    base !== commitOf(repositoryRoot, 'HEAD') ||
    !followsHead(repositoryRoot, configuredBase)
  ) {
    return configuredBase;
  }
  throw configError(
    `"base" is ${configuredBase}, the commit you are on, so the change would be compared with itself. Name a branch such as "origin/main", or pass --base <ref>.`,
  );
}

function symbolicName(repositoryRoot, ref) {
  return gitOrUndefined(repositoryRoot, ['rev-parse', '--symbolic-full-name', ref])?.trim();
}

function commitOf(repositoryRoot, ref) {
  return gitOrUndefined(repositoryRoot, [
    'rev-parse',
    '--verify',
    '--quiet',
    `${ref}^{commit}`,
  ])?.trim();
}

function isNonEmpty(value) {
  return typeof value === 'string' && value.length > 0;
}

function gitOrUndefined(repositoryRoot, args) {
  try {
    return runGit(repositoryRoot, args);
  } catch (error) {
    if (error instanceof GitCommandError) {
      return undefined;
    }
    throw error;
  }
}
