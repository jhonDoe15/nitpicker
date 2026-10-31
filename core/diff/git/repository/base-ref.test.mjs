import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureGit, useGitFixtures } from '../test-support/git-repository.mjs';
import { resolveBase } from './base-ref.mjs';

const { createGitRepository } = useGitFixtures();

describe('resolveBase', () => {
  it('prefers an explicit base over CI, config, and remote HEAD', () => {
    const repositoryRoot = createRepository();
    addRemote(repositoryRoot, 'origin');
    setRemoteHead(repositoryRoot, 'origin', 'main');

    expect(
      resolveBase({
        repositoryRoot,
        explicitBase: 'release/2026',
        configuredBase: 'configured',
        environment: { CHANGE_TARGET: 'ci-target' },
      }),
    ).toEqual({ baseRef: 'release/2026', source: 'argument' });
  });

  it.each([
    [
      {
        CHANGE_TARGET: 'change-target',
        GITHUB_BASE_REF: 'github-base',
        CI_MERGE_REQUEST_TARGET_BRANCH_NAME: 'merge-target',
      },
      'origin/change-target',
    ],
    [
      {
        CHANGE_TARGET: '',
        GITHUB_BASE_REF: 'github-base',
        CI_MERGE_REQUEST_TARGET_BRANCH_NAME: 'merge-target',
      },
      'origin/github-base',
    ],
    [
      {
        CHANGE_TARGET: '',
        GITHUB_BASE_REF: '',
        CI_MERGE_REQUEST_TARGET_BRANCH_NAME: 'merge-target',
      },
      'origin/merge-target',
    ],
    [{ CHANGE_TARGET: 'origin/release', GITHUB_BASE_REF: 'github-base' }, 'origin/release'],
    [
      { GITHUB_BASE_REF: '', CI_MERGE_REQUEST_TARGET_BRANCH_NAME: 'release/1.x' },
      'origin/release/1.x',
    ],
    [{ CHANGE_TARGET: 'release/1.x' }, 'origin/release/1.x'],
    [{ SYSTEM_PULLREQUEST_TARGETBRANCH: 'refs/heads/main' }, 'origin/main'],
    [{ SYSTEM_PULLREQUEST_TARGETBRANCH: 'refs/heads/team/main' }, 'origin/team/main'],
    [{ BITBUCKET_PR_DESTINATION_BRANCH: 'develop' }, 'origin/develop'],
    [
      { BUILDKITE_PULL_REQUEST_BASE_BRANCH: 'main', BITBUCKET_PR_DESTINATION_BRANCH: '' },
      'origin/main',
    ],
  ])('resolves the first non-empty CI target: %s', (environment, expected) => {
    expect(resolveBase({ repositoryRoot: createRepository(), environment })).toEqual({
      baseRef: expected,
      source: 'ci',
    });
  });

  it.each([
    [{ GITHUB_BASE_REF: '' }],
    [{ CI_MERGE_REQUEST_TARGET_BRANCH_NAME: '', CHANGE_TARGET: '' }],
    [{ SYSTEM_PULLREQUEST_TARGETBRANCH: '', BITBUCKET_PR_DESTINATION_BRANCH: '' }],
  ])('ignores empty CI targets on a branch build: %j', (environment) => {
    const repositoryRoot = createRepository();
    addRemote(repositoryRoot, 'origin');
    setRemoteHead(repositoryRoot, 'origin', 'main');

    expect(resolveBase({ repositoryRoot, environment })).toEqual({
      baseRef: 'origin/main',
      source: 'remote-head',
    });
  });

  it('prefers a CI target over a configured base', () => {
    expect(
      resolveBase({
        repositoryRoot: createRepository(),
        configuredBase: 'configured',
        environment: { CHANGE_TARGET: 'release' },
      }),
    ).toEqual({ baseRef: 'origin/release', source: 'ci' });
  });

  it('prefers a configured base over remote HEAD', () => {
    const repositoryRoot = createRepository();
    addRemote(repositoryRoot, 'origin');
    setRemoteHead(repositoryRoot, 'origin', 'main');

    expect(
      resolveBase({
        repositoryRoot,
        configuredBase: 'configured',
        environment: {},
      }),
    ).toEqual({
      baseRef: 'configured',
      source: 'config',
    });
  });

  it('rejects a configured base that is the commit being checked', () => {
    const repositoryRoot = createRepository();
    const sha = fixtureGit(repositoryRoot, ['rev-parse', 'HEAD']).trim();

    expect(() => resolveBase({ repositoryRoot, configuredBase: sha, environment: {} })).toThrow(
      /compared with itself/,
    );
    expect(() =>
      resolveBase({ repositoryRoot, configuredBase: sha.slice(0, 8), environment: {} }),
    ).toThrow(/compared with itself/);
  });

  it.each(['HEAD~0', 'HEAD^0', '@{0}', 'main', 'refs/heads/main'])(
    'rejects the configured base %s that follows HEAD',
    (configuredBase) => {
      const repositoryRoot = createRepository();
      setRemoteBranch(repositoryRoot, 'origin', 'main');

      expect(() => resolveBase({ repositoryRoot, configuredBase, environment: {} })).toThrow(
        `"base" is ${configuredBase}, the commit you are on`,
      );
    },
  );

  it('accepts a remote branch at HEAD as the configured base', () => {
    const repositoryRoot = createRepository();
    setRemoteBranch(repositoryRoot, 'origin', 'main');

    expect(resolveBase({ repositoryRoot, configuredBase: 'origin/main', environment: {} })).toEqual(
      { baseRef: 'origin/main', source: 'config' },
    );
  });

  it('accepts a remote HEAD at the checked commit and rejects a reflog entry of HEAD', () => {
    const repositoryRoot = createRepository();
    setRemoteHead(repositoryRoot, 'origin', 'main');
    const resolve = (configuredBase) => () =>
      resolveBase({ repositoryRoot, configuredBase, environment: {} });

    expect(resolve('origin/HEAD')()).toEqual({ baseRef: 'origin/HEAD', source: 'config' });
    expect(resolve('HEAD@{0}')).toThrow('"base" is HEAD@{0}, the commit you are on');
  });

  it('accepts a configured commit id that is not the checked commit, and an explicit base at HEAD', () => {
    const repositoryRoot = createRepository();
    const sha = fixtureGit(repositoryRoot, ['rev-parse', 'HEAD']).trim();
    fixtureGit(repositoryRoot, ['commit', '--allow-empty', '-m', 'next']);

    expect(resolveBase({ repositoryRoot, configuredBase: sha, environment: {} })).toEqual({
      baseRef: sha,
      source: 'config',
    });
    expect(resolveBase({ repositoryRoot, explicitBase: 'HEAD', environment: {} })).toEqual({
      baseRef: 'HEAD',
      source: 'argument',
    });
  });

  it('prefers the upstream remote HEAD over origin remote HEAD', () => {
    const repositoryRoot = createRepository();
    addRemote(repositoryRoot, 'origin');
    addRemote(repositoryRoot, 'upstream');
    setRemoteHead(repositoryRoot, 'origin', 'main');
    setRemoteHead(repositoryRoot, 'upstream', 'develop');

    expect(resolveBase({ repositoryRoot, environment: {} })).toEqual({
      baseRef: 'upstream/develop',
      source: 'remote-head',
    });
  });

  it('uses origin remote HEAD when upstream is absent', () => {
    const repositoryRoot = createRepository();
    addRemote(repositoryRoot, 'origin');
    setRemoteHead(repositoryRoot, 'origin', 'main');

    expect(resolveBase({ repositoryRoot, environment: {} })).toEqual({
      baseRef: 'origin/main',
      source: 'remote-head',
    });
  });

  it('falls back to origin/main when the remote HEAD is missing', () => {
    const repositoryRoot = createRepository();
    addRemote(repositoryRoot, 'origin');
    setRemoteBranch(repositoryRoot, 'origin', 'main');

    expect(resolveBase({ repositoryRoot, environment: {} })).toEqual({
      baseRef: 'origin/main',
      source: 'fallback',
    });
  });

  it('falls back to origin/master when it is the only available origin branch', () => {
    const repositoryRoot = createRepository();
    addRemote(repositoryRoot, 'origin');
    setRemoteBranch(repositoryRoot, 'origin', 'master');

    expect(resolveBase({ repositoryRoot, environment: {} })).toEqual({
      baseRef: 'origin/master',
      source: 'fallback',
    });
  });

  it('ignores the current branch upstream when resolving a fallback', () => {
    const repositoryRoot = createRepository();
    addRemote(repositoryRoot, 'origin');
    setRemoteBranch(repositoryRoot, 'origin', 'main');
    setRemoteBranch(repositoryRoot, 'origin', 'other');
    fixtureGit(repositoryRoot, ['branch', '--set-upstream-to=origin/other', 'main']);

    expect(resolveBase({ repositoryRoot, environment: {} })).toEqual({
      baseRef: 'origin/main',
      source: 'fallback',
    });
  });

  it('throws with the --base suggestion when no base is resolvable', () => {
    const repositoryRoot = createRepository();

    expect(() => resolveBase({ repositoryRoot, environment: {} })).toThrow(
      new Error('No base could be determined. Use --base <ref>.'),
    );
  });

  it('compares a staged run with HEAD when no remote base exists', () => {
    const repositoryRoot = createRepository();

    expect(resolveBase({ repositoryRoot, environment: {}, staged: true })).toEqual({
      baseRef: 'HEAD',
      source: 'staged, no remote base',
    });
  });

  it('still prefers the remote base for a staged run', () => {
    const repositoryRoot = createRepository();
    addRemote(repositoryRoot, 'origin');
    setRemoteHead(repositoryRoot, 'origin', 'main');

    expect(resolveBase({ repositoryRoot, environment: {}, staged: true })).toEqual({
      baseRef: 'origin/main',
      source: 'remote-head',
    });
  });

  it('says how to make the first commit when the repository has none', () => {
    const repositoryRoot = createRepository();
    fixtureGit(repositoryRoot, ['checkout', '-q', '--orphan', 'empty']);

    expect(() => resolveBase({ repositoryRoot, environment: {}, staged: true })).toThrow(
      new Error(
        'No base could be determined: the repository has no commit yet. Make the first commit without the hook (git commit --no-verify), or pass --base <ref>.',
      ),
    );
  });
});

function createRepository() {
  return createGitRepository({}, { prefix: 'nitpicker-base-ref-' }).root;
}

function addRemote(repositoryRoot, remote) {
  fixtureGit(repositoryRoot, ['remote', 'add', remote, path.join(repositoryRoot, `${remote}.git`)]);
}

function setRemoteBranch(repositoryRoot, remote, branch) {
  fixtureGit(repositoryRoot, ['update-ref', `refs/remotes/${remote}/${branch}`, 'HEAD']);
}

function setRemoteHead(repositoryRoot, remote, branch) {
  setRemoteBranch(repositoryRoot, remote, branch);
  fixtureGit(repositoryRoot, [
    'symbolic-ref',
    `refs/remotes/${remote}/HEAD`,
    `refs/remotes/${remote}/${branch}`,
  ]);
}
