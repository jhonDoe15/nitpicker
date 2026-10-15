// Test helper: fast, hermetic Git fixture repositories.
//
// Building a repository per test (`git init`, two `git config`, `git add`, `git commit`) costs
// five or more Git processes, plus whatever the developer's global config adds (commit signing
// alone spawns three more processes and dominates the cost). This helper builds each distinct
// template once per test worker with a hermetic Git environment, then gives every test its own
// copy with a plain filesystem copy. A copied repository is an ordinary, independent repository.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Environment for fixture-building Git commands: ignores the global and system config (signing,
 * hooks, templates, maintenance) and pins identity and dates so fixture SHAs are reproducible.
 */
export const HERMETIC_GIT_ENVIRONMENT = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Nitpicker Fixture',
  GIT_AUTHOR_EMAIL: 'nitpicker@example.invalid',
  GIT_COMMITTER_NAME: 'Nitpicker Fixture',
  GIT_COMMITTER_EMAIL: 'nitpicker@example.invalid',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
};

/** Runs a fixture-setup Git command (never the code under test) with the hermetic environment. */
export function fixtureGit(repositoryRoot, arguments_) {
  return execFileSync('git', arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, ...HERMETIC_GIT_ENVIRONMENT },
    maxBuffer: 10 * 1024 * 1024,
  });
}

const templates = new Map();
const created = [];

/**
 * Returns a fresh copy of a repository on `main` whose single commit holds `files`
 * (an empty commit when there are none). Identical file sets share one template.
 */
export function createGitRepository(files = {}, { prefix = 'nitpicker-git-fixture-' } = {}) {
  const key = JSON.stringify(
    Object.entries(files).sort(([left], [right]) => (left < right ? -1 : 1)),
  );
  let template = templates.get(key);
  if (template === undefined) {
    template = buildTemplate(files);
    templates.set(key, template);
  }
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  created.push(root);
  cpSync(template.root, root, { recursive: true });
  return { root, baseSha: template.sha };
}

/** Removes the copies made since the last call; call from `afterEach`. */
export function removeGitRepositories() {
  for (const root of created.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

function buildTemplate(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-git-template-')));
  process.once('exit', () => rmSync(root, { recursive: true, force: true }));
  fixtureGit(root, ['init', '-q', '--initial-branch=main']);
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
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
  return { root, sha: fixtureGit(root, ['rev-parse', 'HEAD']).trim() };
}

export function createGitTemplate() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-empty-git-template-')));
  fixtureGit(root, ['init', '-q', '--initial-branch=main']);
  fixtureGit(root, ['config', 'user.name', 'Nitpicker Fixture']);
  fixtureGit(root, ['config', 'user.email', 'nitpicker@example.invalid']);
  process.once('exit', () => rmSync(root, { recursive: true, force: true }));
  return root;
}

export function copyGitTemplate(template, root) {
  cpSync(path.join(template, '.git'), path.join(root, '.git'), { recursive: true });
}
