import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { type FileMap, writeFiles } from './fixture-files.mts';

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

export function fixtureGit(
  repositoryRoot: string,
  gitArguments: readonly string[],
  { input }: { readonly input?: string | undefined } = {},
): string {
  return execFileSync('git', gitArguments, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    input,
    env: { ...process.env, ...HERMETIC_GIT_ENVIRONMENT },
    maxBuffer: 10 * 1024 * 1024,
    timeout: GIT_TIMEOUT_MS,
  });
}

export function commit(root: string, message: string): void {
  fixtureGit(root, ['add', '-A']);
  fixtureGit(root, ['commit', '-q', '-m', message]);
}

export function createGitTemplate(): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-empty-git-template-')));
  fixtureGit(root, ['init', '-q', '--initial-branch=main']);
  fixtureGit(root, ['config', 'user.name', 'Nitpicker Fixture']);
  fixtureGit(root, ['config', 'user.email', 'nitpicker@example.invalid']);
  process.once('exit', () => {
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}

export function copyGitTemplate(template: string, root: string): void {
  cpSync(path.join(template, '.git'), path.join(root, '.git'), { recursive: true });
}

function commitBase(root: string, files: FileMap, baseRef: string | undefined): string {
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

type GitRepositoryOptions = { readonly prefix?: string; readonly baseRef?: string };

type GitRepository = {
  readonly root: string;
  readonly baseSha: string;
  readonly baseRef: string | undefined;
};

export function useGitFixtures(): {
  readonly temporaryRoot: (prefix: string) => string;
  readonly createGitRepository: (files?: FileMap, options?: GitRepositoryOptions) => GitRepository;
} {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function temporaryRoot(prefix: string): string {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
    roots.push(root);
    return root;
  }

  function createGitRepository(
    files: FileMap = {},
    { prefix = 'nitpicker-git-fixture-', baseRef }: GitRepositoryOptions = {},
  ): GitRepository {
    const root = temporaryRoot(prefix);
    const baseSha = commitBase(root, files, baseRef);
    return { root, baseSha, baseRef };
  }

  return { temporaryRoot, createGitRepository };
}
