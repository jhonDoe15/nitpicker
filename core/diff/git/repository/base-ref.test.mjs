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

  it('names what it tried when a repository without a remote is on main', () => {
    const repositoryRoot = createRepository();

    expect(() => resolveBase({ repositoryRoot, environment: {} })).toThrow(
      new Error(
        'No base found: no remote, and you are on main. Pass --base <ref>, set "base" in nitpicker.config.json, or run nitpicker --all to check the whole project.',
      ),
    );
  });

  it('compares a feature branch with the local main when there is no remote', () => {
    const repositoryRoot = createRepository();
    fixtureGit(repositoryRoot, ['checkout', '-q', '-b', 'feature']);

    expect(resolveBase({ repositoryRoot, environment: {} })).toEqual({
      baseRef: 'main',
      source: 'local-branch',
    });
  });

  it('uses a local master when there is no main, also from a detached HEAD', () => {
    const repositoryRoot = createRepository();
    fixtureGit(repositoryRoot, ['branch', '-q', '-m', 'master']);
    fixtureGit(repositoryRoot, ['commit', '-q', '--allow-empty', '-m', 'next']);
    fixtureGit(repositoryRoot, ['checkout', '-q', '--detach', 'HEAD~1']);

    expect(resolveBase({ repositoryRoot, environment: {} })).toEqual({
      baseRef: 'master',
      source: 'local-branch',
    });
  });

  it('does not compare a detached HEAD with the local main it sits on', () => {
    const repositoryRoot = createRepository();
    fixtureGit(repositoryRoot, ['checkout', '-q', '--detach']);

    expect(() => resolveBase({ repositoryRoot, environment: {} })).toThrow(
      'No base found: no remote, and you are on main.',
    );
  });

  it('names the local branch so that a tag of the same name cannot shadow it', () => {
    const repositoryRoot = createRepository();
    fixtureGit(repositoryRoot, ['tag', 'main']);
    fixtureGit(repositoryRoot, ['checkout', '-q', '-b', 'feature']);

    expect(resolveBase({ repositoryRoot, environment: {} })).toEqual({
      baseRef: 'heads/main',
      source: 'local-branch',
    });
  });

  it('does not compare master with main when master is checked out', () => {
    const repositoryRoot = createRepository();
    fixtureGit(repositoryRoot, ['checkout', '-q', '-b', 'master']);

    expect(() => resolveBase({ repositoryRoot, environment: {} })).toThrow(
      'No base found: no remote, and you are on master.',
    );
  });

  it('prefers the branch upstream over a local main', () => {
    const repositoryRoot = createRepository();
    addRemote(repositoryRoot, 'gitlab');
    setRemoteBranch(repositoryRoot, 'gitlab', 'develop');
    fixtureGit(repositoryRoot, ['checkout', '-q', '-b', 'feature', '--track', 'gitlab/develop']);

    expect(resolveBase({ repositoryRoot, environment: {} })).toEqual({
      baseRef: 'gitlab/develop',
      source: 'upstream',
    });
  });

  it('uses a local branch the feature branch tracks', () => {
    const repositoryRoot = createRepository();
    fixtureGit(repositoryRoot, ['branch', '-q', '-m', 'trunk']);
    fixtureGit(repositoryRoot, ['checkout', '-q', '-b', 'feature', '--track', 'trunk']);

    expect(resolveBase({ repositoryRoot, environment: {} })).toEqual({
      baseRef: 'trunk',
      source: 'upstream',
    });
  });

  it('skips an upstream that is the pushed copy of the same branch', () => {
    const repositoryRoot = createRepository();
    addRemote(repositoryRoot, 'origin');
    fixtureGit(repositoryRoot, ['checkout', '-q', '-b', 'feature']);
    setRemoteBranch(repositoryRoot, 'origin', 'feature');
    fixtureGit(repositoryRoot, ['branch', '--set-upstream-to=origin/feature']);

    expect(resolveBase({ repositoryRoot, environment: {} })).toEqual({
      baseRef: 'main',
      source: 'local-branch',
    });
  });

  it('keeps the remote default branch ahead of an upstream and a local main', () => {
    const repositoryRoot = createRepository();
    addRemote(repositoryRoot, 'origin');
    setRemoteHead(repositoryRoot, 'origin', 'main');
    setRemoteBranch(repositoryRoot, 'origin', 'develop');
    fixtureGit(repositoryRoot, ['checkout', '-q', '-b', 'feature', '--track', 'origin/develop']);

    expect(resolveBase({ repositoryRoot, environment: {} })).toEqual({
      baseRef: 'origin/main',
      source: 'remote-head',
    });
  });

  it.each([
    ['origin', [], 'no origin/HEAD, origin/main or origin/master'],
    ['upstream', [], 'no upstream/HEAD, origin/main or origin/master'],
    ['gitlab', ['github'], 'no origin or upstream remote (remotes: github, gitlab)'],
  ])('says which remote refs are missing with only %s', (remote, others, expected) => {
    const repositoryRoot = createRepository();
    for (const name of [remote, ...others]) {
      addRemote(repositoryRoot, name);
    }

    expect(() => resolveBase({ repositoryRoot, environment: {} })).toThrow(
      `No base found: ${expected}, and you are on main.`,
    );
  });

  it('says the repository has no commits, even with an explicit base', () => {
    const repositoryRoot = createRepository();
    fixtureGit(repositoryRoot, ['checkout', '-q', '--orphan', 'empty']);
    const message = new Error(
      'This repository has no commits yet. Commit your files, then run nitpicker --all, or compare later changes against that commit.',
    );

    expect(() => resolveBase({ repositoryRoot, environment: {} })).toThrow(message);
    expect(() => resolveBase({ repositoryRoot, explicitBase: 'main', environment: {} })).toThrow(
      message,
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
