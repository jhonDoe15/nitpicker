import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';
import { collectJavaFindings } from '../java-diff.mts';
import type { JavaFinding, JavaPolicy } from '../typed/java-values.mts';

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

export function runGitIn(repository: string, ...args: string[]): void {
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

export function commitBranch(
  repository: string,
  name: string,
  files: Readonly<Record<string, string>>,
  from = 'main',
): void {
  runGitIn(repository, 'checkout', '-q', '-b', name, from);
  for (const [file, content] of Object.entries(files)) {
    const full = path.resolve(repository, file);
    if (!full.startsWith(path.resolve(repository) + path.sep)) {
      throw new Error(`${file} is outside ${repository}`);
    }
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  runGitIn(repository, 'add', '-A');
  runGitIn(repository, 'commit', '-q', '-m', name);
}

export function summarize(findings: readonly JavaFinding[]): string[] {
  return findings
    .map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`)
    .sort();
}

const PLUGIN_BUILD = /^(?:build-logic|buildSrc)\//u;
const CONFIGURATION_MUTATION = /Mutating a configuration|Cannot mutate|Cannot change dependencies/u;

export function analyzeWithIncludedBuild(
  fixture: string,
  { gradle, policy }: { gradle: string; policy: JavaPolicy },
): {
  status: SpawnSyncReturns<string>['status'];
  output: string;
  mutations: string[];
  findings: readonly JavaFinding[];
  nested: JavaFinding[];
} {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-included-build-'));
  try {
    cpSync(fixture, root, { recursive: true });
    const help = spawnSync(
      gradle,
      ['--console=plain', '--warning-mode', 'all', '-I', INIT_SCRIPT, 'help'],
      { cwd: root, encoding: 'utf8', timeout: GRADLE_STEP_TIMEOUT_MS },
    );
    const output = `${help.stdout}${help.stderr}`;
    const findings = collectJavaFindings(root, { gradle, policy });
    return {
      status: help.status,
      output,
      mutations: output.split('\n').filter((line) => CONFIGURATION_MUTATION.test(line)),
      findings,
      nested: findings.filter((finding) => PLUGIN_BUILD.test(finding.path)),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
