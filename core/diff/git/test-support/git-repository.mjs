import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach } from 'vitest';
import { writeFiles } from './fixture-files.mjs';

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

export function fixtureGit(repositoryRoot, arguments_) {
  return execFileSync('git', arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, ...HERMETIC_GIT_ENVIRONMENT },
    maxBuffer: 10 * 1024 * 1024,
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

function buildTemplate(files, baseRef) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-git-template-')));
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
  return { root, sha };
}

function templateKey(files, baseRef) {
  const entries = Object.entries(files).sort(([left], [right]) => (left < right ? -1 : 1));
  return JSON.stringify([baseRef, entries]);
}

export function useGitFixtures() {
  const roots = [];
  const templates = new Map();

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
  afterAll(() => {
    for (const { root } of templates.values()) {
      rmSync(root, { recursive: true, force: true });
    }
    templates.clear();
  });

  function temporaryRoot(prefix) {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
    roots.push(root);
    return root;
  }

  function templateFor(files, baseRef) {
    const key = templateKey(files, baseRef);
    if (!templates.has(key)) {
      templates.set(key, buildTemplate(files, baseRef));
    }
    return templates.get(key);
  }

  function createGitRepository(files = {}, { prefix = 'nitpicker-git-fixture-', baseRef } = {}) {
    const template = templateFor(files, baseRef);
    const root = temporaryRoot(prefix);
    cpSync(template.root, root, { recursive: true });
    return { root, baseSha: template.sha, baseRef };
  }

  return { temporaryRoot, createGitRepository };
}
