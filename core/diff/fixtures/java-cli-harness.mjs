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
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { runCli as runCliWithSubprocesses } from '../../cli.mjs';
import { runTasksInProcess } from './in-process-analyzers.mjs';

export const fakeGradle = path.resolve(
  import.meta.dirname,
  '../../../languages/java/adapters/fixtures/fake-gradle.mjs',
);

const temporaryRoots = [];
const gitEnvironment = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const fixtureState = { templateRoot: undefined };

export function temporaryRoot(prefix) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  temporaryRoots.push(root);
  return root;
}

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

function useTemporaryRoots() {
  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

export function useGradleFixtures() {
  useTemporaryRoots();
  beforeEach(() => {
    vi.stubEnv('NITPICKER_GRADLE', fakeGradle);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  beforeAll(() => {
    const templateRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-template-')));
    fixtureState.templateRoot = templateRoot;
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
  });
  afterAll(() => {
    rmSync(fixtureState.templateRoot, { recursive: true, force: true });
  });
}

export function gradleRepository(files = {}) {
  const root = temporaryRoot('nitpicker-java-cli-');
  cpSync(fixtureState.templateRoot, root, { recursive: true });
  if (Object.keys(files).length > 0) {
    write(root, files);
    commit(root, 'base');
    git(root, ['branch', '-f', 'comparison-base']);
  }
  return root;
}

export function runCli(options) {
  return runCliWithSubprocesses({ runTasks: runTasksInProcess, ...options });
}

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
  function json(name) {
    return JSON.parse(readFileSync(path.join(reports, name), 'utf8'));
  }
  return { exitCode, reports, json, output, text: output.out + output.err };
}

export function kotlinConfig(formatter) {
  return `${JSON.stringify({ preset: 'kotlin', ...(formatter && { kotlin: { formatter } }) })}\n`;
}

export function kotlinRepository(files = {}) {
  return gradleRepository({
    'nitpicker.config.json': kotlinConfig(),
    'detekt.txt': 'Legacy magic number\n',
    ...files,
  });
}
