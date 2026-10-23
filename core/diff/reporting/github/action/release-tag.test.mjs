import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { commit, fixtureGit, useGitFixtures } from '../../../git/test-support/git-repository.mjs';
import { writeFiles } from '../../../git/test-support/fixture-files.mjs';
import { executeStep } from './test-support/action-steps.mjs';

const repositoryRoot = path.join(import.meta.dirname, '../../../../..');

const workflow = parse(
  readFileSync(path.join(repositoryRoot, '.github/workflows/github-release.yml'), 'utf8'),
);

const step = workflow.jobs.release.steps.find(({ name }) => name === 'Move the floating tag');

const { createGitRepository, temporaryRoot } = useGitFixtures();

function releaseClone() {
  const remote = temporaryRoot('nitpicker-release-remote-');
  fixtureGit(remote, ['init', '-q', '--bare']);
  const clone = createGitRepository({ 'a.txt': 'a\n' }).root;
  fixtureGit(clone, ['remote', 'add', 'origin', remote]);
  return { remote, clone };
}

function release(clone, tag) {
  writeFiles(clone, { 'release.txt': `${tag}\n` });
  commit(clone, tag);
  const sha = fixtureGit(clone, ['rev-parse', 'HEAD']).trim();
  const result = executeStep({
    name: 'release',
    step,
    root: temporaryRoot('nitpicker-release-runner-'),
    cwd: clone,
    environment: { TAG: tag, COMMIT: sha, PATH: process.env.PATH },
  });
  return { ...result, sha };
}

function remoteTags(remote) {
  return fixtureGit(remote, ['tag', '--list', '--format=%(refname:short) %(objectname)'])
    .split('\n')
    .filter(Boolean);
}

describe('the floating release tag', () => {
  it('runs for stable releases only', () => {
    expect(step.if).toBe('${{ !inputs.prerelease }}');
  });

  it('moves v0.<minor> before 1.0 and v<major> from 1.0', () => {
    const { remote, clone } = releaseClone();
    const first = release(clone, 'v0.1.0');
    const patch = release(clone, 'v0.1.1');
    const major = release(clone, 'v1.2.0');

    expect([first.status, patch.status, major.status]).toEqual([0, 0, 0]);
    expect(remoteTags(remote)).toEqual([`v0.1 ${patch.sha}`, `v1 ${major.sha}`]);
  });

  it('leaves the tags alone for a version with a pre-release suffix', () => {
    const { remote, clone } = releaseClone();
    const { status, stdout } = release(clone, 'v0.2.0-rc.1');

    expect([status, stdout, remoteTags(remote)]).toEqual([
      0,
      '::notice::v0.2.0-rc.1 has a pre-release suffix; no floating tag moves.\n',
      [],
    ]);
  });

  it('refuses to move a tag back to a commit that does not contain it', () => {
    const { remote, clone } = releaseClone();
    const later = release(clone, 'v0.3.1');
    fixtureGit(clone, ['checkout', '-q', '-b', 'old', 'HEAD~1']);
    const { status, stdout } = release(clone, 'v0.3.0');

    expect([status, stdout, remoteTags(remote)]).toEqual([
      1,
      '::error::v0.3 points at a commit that v0.3.0 does not contain; move it by hand if that is intended.\n',
      [`v0.3 ${later.sha}`],
    ]);
  });
});
