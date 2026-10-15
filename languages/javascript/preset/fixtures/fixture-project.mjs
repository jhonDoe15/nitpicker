import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../../../../core/cli.mjs';
import { withDefaultAnalyzerParallelism } from '../../../../core/diff/fixtures/analyzer-parallelism.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');
const temporaryRoots = [];

export const FIXTURE_TIMEOUT_MS = 300_000;

export function removeProjects() {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

export function keepProject(root) {
  temporaryRoots.splice(temporaryRoots.indexOf(root), 1);
}

export function git(root, ...args) {
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=f@example.invalid', ...args], {
    cwd: root,
  });
}

export function writeProjectFiles(root, files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
}

export function createProject(fixtureRoot, files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-fixture-'));
  temporaryRoots.push(root);
  cpSync(fixtureRoot, root, { recursive: true });
  writeFileSync(path.join(root, '.gitignore'), 'node_modules/\nreports/\n');
  symlinkSync(path.join(packageRoot, 'node_modules'), path.join(root, 'node_modules'));
  writeProjectFiles(root, files);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'fixture');
  return root;
}

export function run(root, argumentsList) {
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

export function runSnapshot(root, extraArguments = []) {
  const output = path.join(root, 'reports/snapshot');
  const result = run(root, ['--all', '--output', output, ...extraArguments]);
  const summary = JSON.parse(readFileSync(path.join(output, 'summary.json'), 'utf8'));
  const findings = JSON.parse(readFileSync(path.join(output, 'findings.json'), 'utf8'));
  return { ...result, summary: { ...summary, findings } };
}
