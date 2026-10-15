import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const GRADLE_STEP_TIMEOUT_MS = 15 * 60 * 1000;

const GIT_ENVIRONMENT = {
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

export function runGitIn(repository, ...args) {
  const result = spawnSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENVIRONMENT },
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
}

export function commitBranch(repository, name, files) {
  runGitIn(repository, 'checkout', '-q', '-b', name, 'main');
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(repository, file)), { recursive: true });
    writeFileSync(path.join(repository, file), content);
  }
  runGitIn(repository, 'add', '-A');
  runGitIn(repository, 'commit', '-q', '-m', name);
}

export const summarize = (findings) =>
  findings.map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`).sort();
