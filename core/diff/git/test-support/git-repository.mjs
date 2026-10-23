import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { writeFiles } from './fixture-files.mjs';

const GIT_TIMEOUT_MS = 30_000;

const HERMETIC_GIT_ENVIRONMENT = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Nitpicker Fixture',
  GIT_AUTHOR_EMAIL: 'nitpicker@example.invalid',
  GIT_COMMITTER_NAME: 'Nitpicker Fixture',
  GIT_COMMITTER_EMAIL: 'nitpicker@example.invalid',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
};

export function fixtureGit(repositoryRoot, arguments_, { input } = {}) {
  return execFileSync('git', arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    input,
    env: { ...process.env, ...HERMETIC_GIT_ENVIRONMENT },
    maxBuffer: 10 * 1024 * 1024,
    timeout: GIT_TIMEOUT_MS,
  });
}

export function commit(root, message) {
  fixtureGit(root, ['add', '-A']);
  fixtureGit(root, ['commit', '-q', '-m', message]);
}

export function createGitTemplate() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-empty-git-template-')));
  fixtureGit(root, ['init', '-q', '--initial-branch=main']);
  fixtureGit(root, ['config', 'user.name', 'Nitpicker Fixture']);
  fixtureGit(root, ['config', 'user.email', 'nitpicker@example.invalid']);
  process.once('exit', () => {
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}

export function copyGitTemplate(template, root) {
  cpSync(path.join(template, '.git'), path.join(root, '.git'), { recursive: true });
}

function commitBase(root, files, baseRef) {
  fixtureGit(root, ['init', '-q', '--initial-branch=main']);
  writeFiles(root, files);
  fixtureGit(root, ['add', '-A']);
  fixtureGit(root, [
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'maintenance.auto=false',
    'commit',
    '--allow-empty',
    '-q',
    '-m',
    'base',
  ]);
  const sha = fixtureGit(root, ['rev-parse', 'HEAD']).trim();
  if (baseRef !== undefined) {
    fixtureGit(root, ['branch', baseRef, sha]);
  }
  return sha;
}

export function useGitFixtures() {
  const roots = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function temporaryRoot(prefix) {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
    roots.push(root);
    return root;
  }

  function createGitRepository(files = {}, { prefix = 'nitpicker-git-fixture-', baseRef } = {}) {
    const root = temporaryRoot(prefix);
    const baseSha = commitBase(root, files, baseRef);
    return { root, baseSha, baseRef };
  }

  return { temporaryRoot, createGitRepository };
}
