import { configError } from '../../../../shared/config.mjs';
import { GitCommandError, listRemotes, runGit } from './command.mjs';

type BaseChoice = { readonly baseRef: string; readonly source: string };

type BaseRequest = {
  readonly repositoryRoot: string;
  readonly explicitBase?: unknown;
  readonly configuredBase?: unknown;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly staged: boolean;
};

const remotesOf: (repositoryRoot: string) => string[] = listRemotes;
const git: (repositoryRoot: string, args: readonly string[]) => string = runGit;

const COMMIT_ID = /^[0-9a-f]{7,40}$/iu;
export const CI_TARGET_VARIABLES = [
  'CHANGE_TARGET',
  'GITHUB_BASE_REF',
  'CI_MERGE_REQUEST_TARGET_BRANCH_NAME',
  'SYSTEM_PULLREQUEST_TARGETBRANCH',
  'BITBUCKET_PR_DESTINATION_BRANCH',
  'BUILDKITE_PULL_REQUEST_BASE_BRANCH',
];

const BRANCH_REF_PREFIX = 'refs/heads/';

const HEAD_SYNTAX = /^(?:HEAD|@)(?:$|[~^@{])|@\{/u;

const LOCAL_DEFAULT_BRANCHES = ['main', 'master'];

const NO_BASE_OPTIONS = [
  'Pass --base <ref>, set "base" in nitpicker.config.json,',
  'or run nitpicker --all to check the whole project.',
].join(' ');

const NO_COMMITS_MESSAGE = [
  'This repository has no commits yet. Commit your files, then run nitpicker --all,',
  'or compare later changes against that commit.',
].join(' ');

const NO_COMMITS_FOR_HOOK_MESSAGE = [
  'No base could be determined: the repository has no commit yet.',
  'Make the first commit without the hook (git commit --no-verify), or pass --base <ref>.',
].join(' ');

export function assertHasCommit(
  repositoryRoot: string,
  message: string = NO_COMMITS_MESSAGE,
): void {
  if (commitOf(repositoryRoot, 'HEAD') === undefined) {
    throw new Error(message);
  }
}

export function resolveBase({
  repositoryRoot,
  explicitBase,
  configuredBase,
  environment = {},
  staged,
}: BaseRequest): BaseChoice {
  assertHasCommit(repositoryRoot, staged ? NO_COMMITS_FOR_HOOK_MESSAGE : NO_COMMITS_MESSAGE);
  if (isNonEmpty(explicitBase)) {
    return { baseRef: explicitBase, source: 'argument' };
  }

  const ciTarget = CI_TARGET_VARIABLES.map((name) => environment[name])
    .filter(isNonEmpty)
    .map(branchName)
    .find(isNonEmpty);
  if (ciTarget !== undefined) {
    return {
      baseRef: ciTarget.startsWith('origin/') ? ciTarget : `origin/${ciTarget}`,
      source: 'ci',
    };
  }

  if (isNonEmpty(configuredBase)) {
    return { baseRef: notCheckedOutCommit(repositoryRoot, configuredBase), source: 'config' };
  }

  return inferredBase(repositoryRoot, staged);
}

function inferredBase(repositoryRoot: string, staged: boolean): BaseChoice {
  const remotes = remotesOf(repositoryRoot);
  const branch = currentBranch(repositoryRoot);
  const onDefault = defaultBranchAtHead(repositoryRoot, branch);
  const found =
    remoteBase(repositoryRoot, remotes) ??
    upstreamBase(repositoryRoot, branch) ??
    localBranchBase(repositoryRoot, onDefault);
  if (found === undefined && staged) {
    return { baseRef: 'HEAD', source: 'staged, no remote base' };
  }
  if (found === undefined) {
    throw noBaseError(remotes, onDefault);
  }
  return found;
}

function remoteBase(repositoryRoot: string, remotes: readonly string[]): BaseChoice | undefined {
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
    (ref) => commitOf(repositoryRoot, `refs/remotes/${ref}`) !== undefined,
  );
  return fallback === undefined ? undefined : { baseRef: fallback, source: 'fallback' };
}

function upstreamBase(repositoryRoot: string, branch: string | undefined): BaseChoice | undefined {
  if (branch === undefined) {
    return undefined;
  }
  const merged = gitOrUndefined(repositoryRoot, [
    'config',
    '--get',
    `branch.${branch}.merge`,
  ])?.trim();
  if (merged === undefined || merged === `${BRANCH_REF_PREFIX}${branch}`) {
    return undefined;
  }
  const upstream = gitOrUndefined(repositoryRoot, [
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    `${branch}@{upstream}`,
  ])?.trim();
  return isNonEmpty(upstream) ? { baseRef: upstream, source: 'upstream' } : undefined;
}

function defaultBranchAtHead(
  repositoryRoot: string,
  branch: string | undefined,
): string | undefined {
  if (branch !== undefined) {
    return LOCAL_DEFAULT_BRANCHES.includes(branch) ? branch : undefined;
  }
  const head = commitOf(repositoryRoot, 'HEAD');
  return LOCAL_DEFAULT_BRANCHES.find(
    (name) => commitOf(repositoryRoot, `${BRANCH_REF_PREFIX}${name}`) === head,
  );
}

function localBranchBase(
  repositoryRoot: string,
  onDefault: string | undefined,
): BaseChoice | undefined {
  if (onDefault !== undefined) {
    return undefined;
  }
  const local = LOCAL_DEFAULT_BRANCHES.map((name) => `${BRANCH_REF_PREFIX}${name}`).find(
    (ref) => commitOf(repositoryRoot, ref) !== undefined,
  );
  if (local === undefined) {
    return undefined;
  }
  const baseRef = git(repositoryRoot, ['rev-parse', '--abbrev-ref', local]).trim();
  return { baseRef, source: 'local-branch' };
}

function noBaseError(remotes: readonly string[], onDefault: string | undefined): Error {
  const local = onDefault === undefined ? 'no local main or master' : `you are on ${onDefault}`;
  return new Error(`No base found: ${remoteGap(remotes)}, and ${local}. ${NO_BASE_OPTIONS}`);
}

function remoteGap(remotes: readonly string[]): string {
  if (remotes.length === 0) {
    return 'no remote';
  }
  if (!remotes.includes('origin') && !remotes.includes('upstream')) {
    return `no origin or upstream remote (remotes: ${remotes.join(', ')})`;
  }
  const remote = remotes.includes('upstream') ? 'upstream' : 'origin';
  return `no ${remote}/HEAD, origin/main or origin/master`;
}

function currentBranch(repositoryRoot: string): string | undefined {
  const ref = gitOrUndefined(repositoryRoot, ['symbolic-ref', '--quiet', 'HEAD'])?.trim();
  return ref?.startsWith(BRANCH_REF_PREFIX) === true
    ? ref.slice(BRANCH_REF_PREFIX.length)
    : undefined;
}

function followsHead(repositoryRoot: string, configuredBase: string): boolean {
  if (COMMIT_ID.test(configuredBase) || HEAD_SYNTAX.test(configuredBase)) {
    return true;
  }
  const name = symbolicName(repositoryRoot, configuredBase);
  return name !== undefined && name !== '' && name === symbolicName(repositoryRoot, 'HEAD');
}

function notCheckedOutCommit(repositoryRoot: string, configuredBase: string): string {
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

function symbolicName(repositoryRoot: string, ref: string): string | undefined {
  return gitOrUndefined(repositoryRoot, ['rev-parse', '--symbolic-full-name', ref])?.trim();
}

function commitOf(repositoryRoot: string, ref: string): string | undefined {
  return gitOrUndefined(repositoryRoot, [
    'rev-parse',
    '--verify',
    '--quiet',
    `${ref}^{commit}`,
  ])?.trim();
}

function branchName(target: string): string {
  return target.startsWith(BRANCH_REF_PREFIX) ? target.slice(BRANCH_REF_PREFIX.length) : target;
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function gitOrUndefined(repositoryRoot: string, args: readonly string[]): string | undefined {
  try {
    return git(repositoryRoot, args);
  } catch (error) {
    if (error instanceof GitCommandError) {
      return undefined;
    }
    throw error;
  }
}
