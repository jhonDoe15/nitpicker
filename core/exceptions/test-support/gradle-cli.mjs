import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { runCli as runCliWithSubprocesses } from '../../cli.mjs';
import { runTasksInProcess } from '../../diff/execution/test-support/in-process-analyzers.mjs';

export const fakeGradle = path.resolve(
  import.meta.dirname,
  '../../../languages/java/adapters/fixtures/fake-gradle.mjs',
);
const temporaryRoots = [];
let previousGradle;
let templateRoot;

export function temporaryRoot(prefix) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  temporaryRoots.push(root);
  return root;
}

// Hermetic git: ignores the global config (commit signing adds a round trip to every commit).
const gitEnvironment = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

export function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: gitEnvironment });
}

export function write(root, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
}

export function commit(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
}

// Extra files become part of the base commit, so a test can start from a different base.
export function gradleRepository(files = {}) {
  const root = temporaryRoot('nitpicker-java-cli-');
  cpSync(templateRoot, root, { recursive: true });
  if (Object.keys(files).length > 0) {
    write(root, files);
    commit(root, 'base');
    git(root, ['branch', '-f', 'comparison-base']);
  }
  return root;
}

// The Java runner runs in-process (it still spawns the fake gradle); the test that passes
// `{ subprocess: true }` keeps the real analyzer-scheduler and java-runner.mjs processes.
export const runCli = (options) =>
  runCliWithSubprocesses({ runTasks: runTasksInProcess, ...options });

export function run(root, extra = [], { subprocess = false } = {}) {
  const output = { out: '', err: '' };
  const reports = path.join(temporaryRoot('nitpicker-java-out-'), 'reports');
  const exitCode = runCli({
    arguments_: ['--base', 'comparison-base', '--output', reports, ...extra],
    environment: { NO_COLOR: '1' },
    currentProjectRoot: root,
    stdout: { write: (value) => (output.out += value) },
    stderr: { write: (value) => (output.err += value) },
    progress: { write: () => undefined },
    ...(subprocess ? { runTasks: undefined } : {}),
  });
  const json = (name) => JSON.parse(readFileSync(path.join(reports, name), 'utf8'));
  return { exitCode, reports, json, output };
}

function createTemplate() {
  templateRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-template-')));
  git(templateRoot, ['init', '-q', '--initial-branch=main']);
  git(templateRoot, ['config', 'user.name', 'Nitpicker Java Fixture']);
  git(templateRoot, ['config', 'user.email', 'nitpicker-java@example.invalid']);
  write(templateRoot, {
    'nitpicker.config.json': '{ "preset": "java" }\n',
    'build.gradle': "plugins { id 'java' }\n",
    'src/main/java/demo/A.java': 'package demo;\n\npublic final class A {}\n',
    'violations.txt': 'Avoid unused field: legacy\n',
  });
  commit(templateRoot, 'base');
  git(templateRoot, ['branch', 'comparison-base']);
}

function restoreGradle() {
  if (previousGradle === undefined) {
    delete process.env.NITPICKER_GRADLE;
  } else {
    process.env.NITPICKER_GRADLE = previousGradle;
  }
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

// One repository with the default Gradle project, built once per file; each test copies it.
export function useGradleCli() {
  beforeEach(() => {
    previousGradle = process.env.NITPICKER_GRADLE;
    process.env.NITPICKER_GRADLE = fakeGradle;
  });
  afterEach(restoreGradle);
  beforeAll(createTemplate);
  afterAll(() => rmSync(templateRoot, { recursive: true, force: true }));
}
