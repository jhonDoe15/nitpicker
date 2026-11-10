import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../core/tooling/tool-resolution.mjs';

const root = PACKAGE_ROOT;
const SCRIPT = path.join(root, 'scripts/check-public-text.sh');
const USAGE = [
  'Usage: BASE_SHA=<commit> HEAD_SHA=<commit> [PR_TITLE=<title>] [PR_BODY=<body>] [DENYLIST=<regex>] \\',
  '  bash scripts/check-public-text.sh',
  '',
  'Checks the commit messages in BASE_SHA..HEAD_SHA, and the PR title and body when given, for private',
  'workspace links, ids and paths. To check a local branch before pushing:',
  '  BASE_SHA=$(git merge-base origin/main HEAD) HEAD_SHA=HEAD bash scripts/check-public-text.sh',
  '',
].join('\n');

function check(environment) {
  const result = spawnSync('bash', [SCRIPT], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...environment },
    timeout: 10_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('check-public-text.sh', () => {
  it('prints its usage instead of failing on an unset variable when the commits are not named', () => {
    expect(check({})).toEqual({ status: 2, stdout: '', stderr: USAGE });
    expect(check({ BASE_SHA: 'HEAD' })).toEqual({ status: 2, stdout: '', stderr: USAGE });
  });

  it('passes clean text and fails a description that names a private id', () => {
    const range = { BASE_SHA: 'HEAD', HEAD_SHA: 'HEAD', PR_TITLE: 'Fix the cache' };

    expect(check({ ...range, PR_BODY: 'Closes #1.' })).toEqual({
      status: 0,
      stdout: 'PR text and commit messages are clean.\n',
      stderr: '',
    });
    expect(check({ ...range, PR_BODY: 'Notes in cse_0123456789ab' })).toEqual({
      status: 1,
      stdout: [
        '::error::PR description contains a private workspace link, id or path:',
        '1:Notes in cse_0123456789ab',
        'Remove these from the text, or reword the commits, and push again.',
        '',
      ].join('\n'),
      stderr: '',
    });
  });
});
