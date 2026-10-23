import { describe, expect, it } from 'vitest';
import { commit, fixtureGit, useGitFixtures } from '../test-support/git-repository.mjs';
import { writeFiles } from '../test-support/fixture-files.mjs';
import { resolveBase } from './base-ref.mjs';
import { resolveComparison } from './git.mjs';
import { runCli } from '../../../cli.mjs';
import { captureOutput } from '../../reporting/test-support/output-capture.mjs';

const { createGitRepository, temporaryRoot } = useGitFixtures();

function createRemote(targetBranch) {
  const remote = createGitRepository({ 'a.txt': 'a\n' }).root;
  if (targetBranch !== 'main') {
    fixtureGit(remote, ['branch', targetBranch]);
  }
  fixtureGit(remote, ['checkout', '-q', '-b', 'feature']);
  for (const index of [1, 2, 3]) {
    writeFiles(remote, { [`feature-${String(index)}.txt`]: `${String(index)}\n` });
    commit(remote, `feature ${String(index)}`);
  }
  const forkPoint = fixtureGit(remote, ['rev-parse', 'feature~3']).trim();
  fixtureGit(remote, ['checkout', '-q', targetBranch]);
  for (const index of [1, 2]) {
    writeFiles(remote, { [`target-${String(index)}.txt`]: `${String(index)}\n` });
    commit(remote, `target ${String(index)}`);
  }
  fixtureGit(remote, ['checkout', '-q', 'feature']);
  return { remote, forkPoint };
}

function checkoutLikeRunner(remote, depth) {
  const checkout = temporaryRoot('nitpicker-ci-checkout-');
  fixtureGit(checkout, ['init', '-q']);
  fixtureGit(checkout, ['remote', 'add', 'origin', `file://${remote}`]);
  const sha = fixtureGit(remote, ['rev-parse', 'feature']).trim();
  fixtureGit(checkout, [
    'fetch',
    '-q',
    ...(depth === undefined ? [] : [`--depth=${String(depth)}`]),
    'origin',
    `+${sha}:refs/remotes/origin/feature`,
  ]);
  fixtureGit(checkout, ['checkout', '-q', '--detach', sha]);
  return checkout;
}

function comparisonFor(checkout, environment) {
  const base = resolveBase({ repositoryRoot: checkout, environment });
  return { base, resolve: () => resolveComparison(checkout, base.baseRef) };
}

function failureOf(action) {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('expected the action to fail');
}

describe.each([
  ['GitHub Actions', { GITHUB_BASE_REF: 'main' }, 'main'],
  [
    'GitLab merge request pipeline',
    { CI_MERGE_REQUEST_TARGET_BRANCH_NAME: 'release/1.x' },
    'release/1.x',
  ],
  ['Jenkins multibranch pull request', { CHANGE_TARGET: 'release/1.x' }, 'release/1.x'],
  ['Azure Pipelines', { SYSTEM_PULLREQUEST_TARGETBRANCH: 'refs/heads/main' }, 'main'],
  ['Bitbucket Pipelines', { BITBUCKET_PR_DESTINATION_BRANCH: 'main' }, 'main'],
])('%s checkout', (_name, environment, targetBranch) => {
  it('finds the merge base once the target branch is fetched in full', () => {
    const { remote, forkPoint } = createRemote(targetBranch);
    const checkout = checkoutLikeRunner(remote);
    fixtureGit(checkout, [
      'fetch',
      '-q',
      'origin',
      `+refs/heads/${targetBranch}:refs/remotes/origin/${targetBranch}`,
    ]);

    const { base, resolve } = comparisonFor(checkout, environment);

    expect(base).toEqual({ baseRef: `origin/${targetBranch}`, source: 'ci' });
    expect(resolve().mergeBaseSha).toBe(forkPoint);
  });

  it('names the fetch that a shallow checkout without the target branch needs', () => {
    const { remote, forkPoint } = createRemote(targetBranch);
    const checkout = checkoutLikeRunner(remote, 1);
    const { resolve } = comparisonFor(checkout, environment);

    expect(failureOf(resolve).message).toBe(
      `Cannot resolve base ref "origin/${targetBranch}". ` +
        `Run \`git fetch --unshallow 'origin' '${targetBranch}'\` and retry.`,
    );

    fixtureGit(checkout, ['fetch', '-q', '--unshallow', 'origin', targetBranch]);

    expect(resolve().mergeBaseSha).toBe(forkPoint);
  });
});

describe('a checkout whose history stops before the merge base', () => {
  it('tells how to deepen it, and the deepened checkout compares', () => {
    const { remote, forkPoint } = createRemote('main');
    const checkout = checkoutLikeRunner(remote, 1);
    fixtureGit(checkout, [
      'fetch',
      '-q',
      '--depth=1',
      'origin',
      '+refs/heads/main:refs/remotes/origin/main',
    ]);
    const { resolve } = comparisonFor(checkout, { GITHUB_BASE_REF: 'main' });

    expect(failureOf(resolve).message).toBe(
      'Cannot find a merge base between HEAD and "origin/main". ' +
        "Run `git fetch --unshallow 'origin' 'main'` and retry.",
    );
    fixtureGit(checkout, ['fetch', '-q', '--unshallow', 'origin', 'main']);
    expect(resolve().mergeBaseSha).toBe(forkPoint);
  });

  it('compares a full clone without any extra fetch', () => {
    const { remote, forkPoint } = createRemote('main');
    const checkout = temporaryRoot('nitpicker-ci-full-');
    fixtureGit(checkout, ['clone', '-q', `file://${remote}`, '.']);

    const { base, resolve } = comparisonFor(checkout, { CHANGE_TARGET: 'main' });

    expect(base.baseRef).toBe('origin/main');
    expect(resolve().mergeBaseSha).toBe(forkPoint);
  });
});

describe('nitpicker base', () => {
  function base(checkout, arguments_, environment) {
    const output = captureOutput();
    const exitCode = runCli({
      arguments_: ['base', ...arguments_],
      currentProjectRoot: checkout,
      environment,
      stdout: output.stdout,
      stderr: output.stderr,
    });
    return { exitCode, stdout: output.stdoutText, stderr: output.stderrText };
  }

  function fullClone() {
    const { remote } = createRemote('develop');
    const checkout = temporaryRoot('nitpicker-ci-base-');
    fixtureGit(checkout, ['clone', '-q', `file://${remote}`, '.']);
    return checkout;
  }

  it('prints the base a comparison would use, from the CI target branch', () => {
    expect(base(fullClone(), [], { CI_MERGE_REQUEST_TARGET_BRANCH_NAME: 'develop' })).toEqual({
      exitCode: 0,
      stdout: 'origin/develop\n',
      stderr: '',
    });
  });

  it('takes the base of nitpicker.config.json when CI names no target', () => {
    const checkout = fullClone();
    writeFiles(checkout, { 'nitpicker.config.json': '{ "base": "origin/develop" }\n' });

    expect(base(checkout, [], {})).toEqual({ exitCode: 0, stdout: 'origin/develop\n', stderr: '' });
  });

  it('prefers --base and falls back to the remote default branch', () => {
    const checkout = fullClone();

    expect(base(checkout, ['--base', 'origin/main'], { GITHUB_BASE_REF: 'develop' }).stdout).toBe(
      'origin/main\n',
    );
    expect(base(checkout, [], {}).stdout).toBe('origin/feature\n');
  });

  it('rejects an unknown argument', () => {
    expect(base(fullClone(), ['--all'], {})).toEqual({
      exitCode: 2,
      stdout: '',
      stderr: 'nitpicker failed: Unknown argument: --all. Usage: nitpicker base [--base <ref>]\n',
    });
  });
});
