import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';
import { collectJavaFindings } from '../java-diff.mjs';

export const GRADLE_STEP_TIMEOUT_MS = 3 * 60 * 1000;
const GIT_TIMEOUT_MS = 30_000;

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
    timeout: GIT_TIMEOUT_MS,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
}

export function commitBranch(repository, name, files, from = 'main') {
  runGitIn(repository, 'checkout', '-q', '-b', name, from);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(repository, file)), { recursive: true });
    writeFileSync(path.join(repository, file), content);
  }
  runGitIn(repository, 'add', '-A');
  runGitIn(repository, 'commit', '-q', '-m', name);
}

export function summarize(findings) {
  return findings
    .map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`)
    .sort();
}

const CONFIGURATION_MUTATION = /Mutating a configuration|Cannot mutate|Cannot change dependencies/u;

export function analyzeWithIncludedBuild(fixture, { gradle, policy }) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-included-build-'));
  try {
    cpSync(fixture, root, { recursive: true });
    const help = spawnSync(
      gradle,
      ['--console=plain', '--warning-mode', 'all', '-I', INIT_SCRIPT, 'help'],
      { cwd: root, encoding: 'utf8', timeout: GRADLE_STEP_TIMEOUT_MS },
    );
    const output = `${help.stdout}${help.stderr}`;
    return {
      status: help.status,
      output,
      mutations: output.split('\n').filter((line) => CONFIGURATION_MUTATION.test(line)),
      findings: collectJavaFindings(root, { gradle, policy }),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
