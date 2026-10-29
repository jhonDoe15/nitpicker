import { verifyRunnerFixtureDependencies } from './runner-fixture-dependencies.mjs';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../../../../../core/cli.mjs';
import { withDefaultAnalyzerParallelism } from '../../../../../core/diff/execution/test-support/analyzer-parallelism.mjs';
import { copyGitTemplate } from '../../../../../core/diff/git/test-support/git-repository.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../../..');
const GIT_TIMEOUT_MS = 30_000;

export function git(root, ...args) {
  return execFileSync('git', args, {
    cwd: root,
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    timeout: GIT_TIMEOUT_MS,
  });
}

function writeFiles(root, files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
}

export function createCleanProject({ fixtureRoot, gitTemplateRoot, name, files = {} }) {
  const root = mkdtempSync(path.join(tmpdir(), `nitpicker-${name}-`));
  verifyRunnerFixtureDependencies(fixtureRoot);
  cpSync(fixtureRoot, root, { recursive: true });
  writeFileSync(path.join(root, '.gitignore'), 'node_modules/\nreports/\n');
  symlinkSync(path.join(packageRoot, 'node_modules'), path.join(root, 'node_modules'));
  writeFiles(root, files);
  copyGitTemplate(gitTemplateRoot, root);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'fixture');
  return root;
}

export function runNitpicker(root, argumentsList) {
  let stdoutText = '';
  let stderrText = '';
  const exitCode = withDefaultAnalyzerParallelism(() =>
    runCli({
      arguments_: argumentsList,
      environment: { NO_COLOR: '1' },
      currentProjectRoot: root,
      stdout: { write: (text) => (stdoutText += text) },
      stderr: { write: (text) => (stderrText += text) },
      progress: { write: () => undefined },
    }),
  );
  return { exitCode, stdoutText, stderrText };
}

export function readReport(root, ...segments) {
  return JSON.parse(readFileSync(path.join(root, ...segments), 'utf8'));
}

export function runSnapshot(root, extraArguments = []) {
  const result = runNitpicker(root, [
    '--all',
    '--output',
    path.join(root, 'reports/snapshot'),
    ...extraArguments,
  ]);
  return {
    ...result,
    summary: readReport(root, 'reports/snapshot/summary.json'),
    toolErrors: readReport(root, 'reports/snapshot/tool-errors.json'),
    findings: readReport(root, 'reports/snapshot/findings.json'),
  };
}

export function metricValue(findings, tool, identity) {
  return findings.find((finding) => finding.tool === tool && finding.identity === identity)?.metric
    .value;
}
