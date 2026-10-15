import { createGitTemplate, copyGitTemplate } from '../diff/fixtures/git-repository.mjs';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, beforeAll, afterEach, expect, it } from 'vitest';
import { runCli as runCliWithSubprocesses } from '../cli.mjs';
import { runTasksInProcess } from '../diff/fixtures/in-process-analyzers.mjs';
import { resolveRunLockPath } from './run-lock.mjs';

// Most tests here are about diff, report and CLI logic, so the analyzer task graph and the fixture
// analyzers run in-process. A test that passes `runTasks: undefined` keeps the real
// analyzer-scheduler subprocess path (exit codes, invalid JSON, timeouts). Progress lines are
// discarded unless a test passes `progress`.
const discardedProgress = { write() {} };

const runCli = (options) =>
  runCliWithSubprocesses({ runTasks: runTasksInProcess, progress: discardedProgress, ...options });

const fakeAnalyzerPath = path.join(
  new URL('../', import.meta.url).pathname,
  'diff/fixtures/fake-analyzer.mjs',
);

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createRepository(initialFiles) {
  const root = realpathSync(makeTemporaryRoot('nitpicker-cli-repo-'));
  copyGitTemplate(gitTemplate.root, root);
  writeFiles(root, {
    'package.json': '{"name":"cli-fixture","version":"1.0.0"}\n',
    'package-lock.json': '{"name":"cli-fixture","lockfileVersion":3}\n',
    '.gitignore': 'node_modules/\n',
    ...initialFiles,
  });
  commit(root, 'base');
  const baseSha = git(root, ['rev-parse', 'HEAD']).trim();
  const baseRef = 'comparison-base';
  git(root, ['branch', baseRef, baseSha]);
  return { root, baseSha, baseRef };
}

function fakeAnalyzer(name = 'fake-quality-analyzer') {
  return {
    name,
    version: '1.0.0',
    configurationHash: 'fixture-policy',
    exclusions: [],
    findingExitCodes: [1],
    createInvocation({ projectRoot, policyRoot, toolRoot }) {
      return {
        command: process.execPath,
        args: [
          fakeAnalyzerPath,
          '--root',
          projectRoot,
          '--policy-root',
          policyRoot,
          '--tool-root',
          toolRoot,
        ],
        cwd: policyRoot,
      };
    },
  };
}

function policy() {
  return `${JSON.stringify({ marker: 'QUALITY_FINDING' }, null, 2)}\n`;
}

function writeFiles(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}

function commit(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
}

// Identity is passed per call, so fixture repositories need no `git config` spawns. The global and
// system config is ignored too: a developer's commit signing (`commit.gpgsign`) adds about 120 ms
// to every fixture commit, and the fixtures must not depend on it.
const gitFixtureEnvironment = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

function git(root, arguments_) {
  return execFileSync(
    'git',
    [
      '-c',
      'user.name=Nitpicker CLI Fixture',
      '-c',
      'user.email=nitpicker-cli@example.invalid',
      ...arguments_,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      env: gitFixtureEnvironment,
    },
  );
}

function makeTemporaryRoot(prefix) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function makeOutputRoot() {
  return path.join(makeTemporaryRoot('nitpicker-cli-output-'), 'reports');
}

function captureOutput() {
  const output = { stdoutText: '', stderrText: '' };
  output.stdout = {
    write(value) {
      output.stdoutText += value;
    },
  };
  output.stderr = {
    write(value) {
      output.stderrText += value;
    },
  };
  return output;
}

const gitTemplate = { root: undefined };

beforeAll(() => {
  gitTemplate.root = createGitTemplate();
});

describe('nitpicker progress and run lock', () => {
  function setup() {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
    });
    const cacheDirectory = makeTemporaryRoot('nitpicker-cli-cache-');
    const run = (extra = {}) => {
      const output = captureOutput();
      const exitCode = runCli({
        arguments_: ['--base', repository.baseRef, '--output', makeOutputRoot()],
        environment: { NITPICKER_CACHE_DIR: cacheDirectory },
        currentProjectRoot: repository.root,
        analyzers: [fakeAnalyzer()],
        stdout: output.stdout,
        stderr: output.stderr,
        progress: output.stderr,
        ...extra,
      });
      return { exitCode, output };
    };
    return { repository, run, lockPath: resolveRunLockPath(repository.root) };
  }
  it('says the base was cached instead of running it again', () => {
    const { run } = setup();
    run();

    const { output } = run();

    expect(output.stderrText.split('\n').filter(Boolean)).toEqual([
      'nitpicker: base 1 analyzer cached',
      'nitpicker: head: running 1 analyzer',
    ]);
  });
  it('labels the single snapshot of --all as head', () => {
    const { run } = setup();

    const { output } = run({ arguments_: ['--all', '--output', makeOutputRoot()] });

    expect(output.stderrText.split('\n').filter(Boolean)).toEqual([
      'nitpicker: head: running 1 analyzer',
    ]);
  });
  it('refuses to start while a live process holds the run lock', () => {
    const { run, lockPath } = setup();
    writeFileSync(lockPath, `${String(process.ppid)}\n`);

    const { exitCode, output } = run();

    expect(exitCode).toBe(2);
    expect(output.stderrText).toBe(
      `nitpicker: another run is in progress in this project (pid ${String(process.ppid)}); wait for it to finish.\n`,
    );
    expect(output.stdoutText).toBe('');
    expect(readFileSync(lockPath, 'utf8')).toBe(`${String(process.ppid)}\n`);
  });
  it('takes over a lock whose process is gone and removes it after the run', () => {
    const { run, lockPath } = setup();
    writeFileSync(lockPath, '2147483646\n');

    const { exitCode } = run();

    expect(exitCode).toBe(0);
    expect(existsSync(lockPath)).toBe(false);
  });
  it('removes the lock after a run that fails', () => {
    const { run, lockPath } = setup();

    const { exitCode } = run({ arguments_: ['--analyzer', 'unknown'] });

    expect(exitCode).toBe(2);
    expect(existsSync(lockPath)).toBe(false);
  });
});
