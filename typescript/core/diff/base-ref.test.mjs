import { execFileSync } from 'node:child_process';
import { realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveBase } from './base-ref.mjs';

const temporaryRepositories = [];

afterEach(() => {
  for (const repositoryRoot of temporaryRepositories.splice(0)) {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

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
  ])('resolves the first non-empty CI target: %s', (environment, expected) => {
    expect(resolveBase({ repositoryRoot: createRepository(), environment })).toEqual({
      baseRef: expected,
      source: 'ci',
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
    git(repositoryRoot, ['branch', '--set-upstream-to=origin/other', 'main']);

    expect(resolveBase({ repositoryRoot, environment: {} })).toEqual({
      baseRef: 'origin/main',
      source: 'fallback',
    });
  });

  it('throws with the --base suggestion when no base is resolvable', () => {
    const repositoryRoot = createRepository();

    expect(() => resolveBase({ repositoryRoot, environment: {} })).toThrow(/--base/);
  });
});

function createRepository() {
  const repositoryRoot = realpathSync(
    execFileSync('mktemp', ['-d', path.join(tmpdir(), 'nitpicker-base-ref-XXXXXX')], {
      encoding: 'utf8',
    }).trim(),
  );
  temporaryRepositories.push(repositoryRoot);
  git(repositoryRoot, ['init', '-q', '--initial-branch=main']);
  git(repositoryRoot, ['config', 'user.name', 'Nitpicker Fixture']);
  git(repositoryRoot, ['config', 'user.email', 'nitpicker@example.invalid']);
  git(repositoryRoot, [
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '--allow-empty',
    '-q',
    '-m',
    'base',
  ]);
  return repositoryRoot;
}

function addRemote(repositoryRoot, remote) {
  git(repositoryRoot, ['remote', 'add', remote, path.join(repositoryRoot, `${remote}.git`)]);
}

function setRemoteBranch(repositoryRoot, remote, branch) {
  git(repositoryRoot, ['update-ref', `refs/remotes/${remote}/${branch}`, 'HEAD']);
}

function setRemoteHead(repositoryRoot, remote, branch) {
  setRemoteBranch(repositoryRoot, remote, branch);
  git(repositoryRoot, [
    'symbolic-ref',
    `refs/remotes/${remote}/HEAD`,
    `refs/remotes/${remote}/${branch}`,
  ]);
}

function git(repositoryRoot, arguments_) {
  return execFileSync('git', arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
}
