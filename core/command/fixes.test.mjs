import { createGitTemplate, copyGitTemplate } from '../diff/fixtures/git-repository.mjs';
import {
  expectedOutput404_31,
  expectedOutput405_31,
  expectedOutput406_31,
  expectedOutput408_85,
  expectedOutput411_89,
  expectedOutput448_31,
  expectedOutput548_31,
} from '../diff/fixtures/expected-output/core-cli.mjs';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, beforeAll, afterEach, expect, it } from 'vitest';
import { runCli as runCliWithSubprocesses } from '../cli.mjs';
import { runTasksInProcess } from '../diff/fixtures/in-process-analyzers.mjs';

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

describe('nitpicker CLI', () => {
  it('fixes changed ESLint and Prettier violations before comparing without touching unchanged files or the index', () => {
    const repository = createRepository({
      'src/main/changed.ts': 'export const changed = 1;\n',
      'src/main/format.mjs': 'export const format = 1;\n',
      'src/main/unchanged.ts': 'export const unchanged=1\n',
      'tests/placeholder.ts': 'export const placeholder = true;\n',
    });
    symlinkSync(
      path.join(new URL('../', import.meta.url).pathname, '../node_modules'),
      path.join(repository.root, 'node_modules'),
      'dir',
    );
    writeFiles(repository.root, {
      'src/main/changed.ts': 'export let changed=2;\n',
    });
    git(repository.root, ['add', 'src/main/changed.ts']);
    writeFiles(repository.root, {
      'src/main/changed.ts': 'export let changed=3;\n',
      'src/main/format.mjs': 'export const format=2\n',
    });
    const indexBefore = git(repository.root, ['ls-files', '--stage']);
    const output = captureOutput();
    const exitCode = runCli({
      arguments_: [
        '--fix',
        '--base',
        repository.baseRef,
        '--analyzer',
        'eslint-lint',
        '--analyzer',
        'prettier-format',
        '--output',
        makeOutputRoot(),
      ],
      currentProjectRoot: repository.root,
      environment: {},
      stdout: output.stdout,
      stderr: output.stderr,
    });
    expect(exitCode, output.stdoutText + output.stderrText).toBe(0);
    expect(readFileSync(path.join(repository.root, 'src/main/changed.ts'), 'utf8')).toBe(
      'export const changed = 3;\n',
    );
    expect(readFileSync(path.join(repository.root, 'src/main/format.mjs'), 'utf8')).toBe(
      'export const format = 2;\n',
    );
    expect(readFileSync(path.join(repository.root, 'src/main/unchanged.ts'), 'utf8')).toBe(
      'export const unchanged=1\n',
    );
    expect(git(repository.root, ['ls-files', '--stage'])).toBe(indexBefore);
    expect(output.stdoutText).toMatch(
      /Fixed files:\nsrc\/main\/changed.ts\nsrc\/main\/format.mjs\nBase:/,
    );
  });
  it('continues remaining fixers and comparison when a fixer fails', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/changed.ts': 'export const changed = 1;\n',
      'src/main/format.mjs': 'export const format = 1;\n',
      'tests/placeholder.ts': 'export const placeholder = true;\n',
    });
    symlinkSync(
      path.join(new URL('../', import.meta.url).pathname, '../node_modules'),
      path.join(repository.root, 'node_modules'),
      'dir',
    );
    writeFiles(repository.root, {
      'src/main/changed.ts': 'export let changed=3;\n',
      'src/main/format.mjs': 'export const format=2\n',
    });
    const output = captureOutput();
    const outputRoot = makeOutputRoot();
    const exitCode = runCli({
      arguments_: ['--fix', '--base', repository.baseRef, '--output', outputRoot],
      currentProjectRoot: repository.root,
      environment: {},
      analyzers: [fakeAnalyzer()],
      executeFixCommand({ operation }) {
        if (operation === 'eslint-fix') {
          return { status: 2, stderr: 'fixture ESLint failure' };
        }
      },
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(2);
    expect(readFileSync(path.join(repository.root, 'src/main/format.mjs'), 'utf8')).toBe(
      'export const format = 2;\n',
    );
    expect(output.stdoutText).toEqual(expectedOutput404_31({ repository, outputRoot }));
    expect(output.stdoutText).toEqual(expectedOutput405_31({ repository, outputRoot }));
    expect(output.stdoutText).toEqual(expectedOutput406_31({ repository, outputRoot }));
    expect(output.stderrText).toBe('');
    expect(JSON.parse(readFileSync(path.join(outputRoot, 'summary.json'), 'utf8'))).toEqual(
      expectedOutput408_85({ repository }),
    );
    expect(JSON.parse(readFileSync(path.join(outputRoot, 'tool-errors.json'), 'utf8'))).toEqual(
      expectedOutput411_89(),
    );
  });
  it('uses a renamed file base path for Prettier fix eligibility', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/legacy.json':
        '[\n{"legacy":true},\n{"legacy":true},\n{"legacy":true},\n{"legacy":true}\n]\n',
    });
    git(repository.root, ['mv', 'src/main/legacy.json', 'src/main/legacy.md']);
    writeFiles(repository.root, {
      'src/main/legacy.md':
        '[\n{"legacy":true},\n{"legacy":true},\n{"legacy":true},\n{"legacy":true}\n]\n\n#  Heading\n\nSome   text\n',
    });
    const output = captureOutput();
    let checkedBasePath;
    const exitCode = runCli({
      arguments_: ['--fix', '--base', repository.baseRef, '--output', makeOutputRoot()],
      currentProjectRoot: repository.root,
      environment: {},
      analyzers: [fakeAnalyzer()],
      executeFixCommand({ operation, input }) {
        if (operation === 'prettier-base-check') {
          checkedBasePath = JSON.parse(input).files[0].filePath;
        }
      },
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(0);
    expect(readFileSync(path.join(repository.root, 'src/main/legacy.md'), 'utf8')).toBe(
      '[\n{"legacy":true},\n{"legacy":true},\n{"legacy":true},\n{"legacy":true}\n]\n\n#  Heading\n\nSome   text\n',
    );
    expect(checkedBasePath).toBe(path.join(repository.root, 'src/main/legacy.json'));
    expect(output.stdoutText).toEqual(expectedOutput448_31({ repository }));
    expect(output.stderrText).toBe('');
  });
  it('formats new and base-clean changes but not edited legacy formatting', () => {
    const repository = createRepository({
      'src/main/clean.mjs': 'export const clean = true;\n',
      'src/main/legacy.mjs': 'export const legacy=true\n',
      'tests/placeholder.ts': 'export const placeholder = true;\n',
    });
    writeFiles(repository.root, {
      'src/main/clean.mjs': 'export const clean=false\n',
      'src/main/legacy.mjs': 'export const legacy=false\n',
      'src/main/new.mjs': 'export const fresh=true\n',
    });
    const output = captureOutput();
    const exitCode = runCli({
      arguments_: [
        '--fix',
        '--base',
        repository.baseRef,
        '--analyzer',
        'prettier-format',
        '--output',
        makeOutputRoot(),
      ],
      currentProjectRoot: repository.root,
      environment: {},
      stdout: output.stdout,
      stderr: output.stderr,
    });
    expect(exitCode, output.stdoutText + output.stderrText).toBe(1);
    expect(readFileSync(path.join(repository.root, 'src/main/clean.mjs'), 'utf8')).toBe(
      'export const clean = false;\n',
    );
    expect(readFileSync(path.join(repository.root, 'src/main/new.mjs'), 'utf8')).toBe(
      'export const fresh = true;\n',
    );
    expect(readFileSync(path.join(repository.root, 'src/main/legacy.mjs'), 'utf8')).toBe(
      'export const legacy=false\n',
    );
    expect(output.stdoutText).toMatch(
      /Fixed files:\nsrc\/main\/clean.mjs\nsrc\/main\/new.mjs\nBase:/,
    );
  });
  it('does not fix files that the config excludes, and fixes custom layout roots', () => {
    const repository = createRepository({
      'nitpicker.config.json': `${JSON.stringify(
        {
          exclude: ['lib/legacy/**'],
          layout: { sourceRoots: ['lib'], testRoots: ['spec'] },
        },
        null,
        2,
      )}\n`,
      'lib/changed.ts': 'export const changed = 1;\n',
      'lib/legacy/old.ts': 'export const old = 1;\n',
      'spec/placeholder.ts': 'export const placeholder = true;\n',
    });
    symlinkSync(
      path.join(new URL('../', import.meta.url).pathname, '../node_modules'),
      path.join(repository.root, 'node_modules'),
      'dir',
    );
    writeFiles(repository.root, {
      'lib/changed.ts': 'export let changed=3;\n',
      'lib/legacy/old.ts': 'export let old=3;\n',
    });
    const output = captureOutput();
    const exitCode = runCli({
      arguments_: [
        '--fix',
        '--base',
        repository.baseRef,
        '--analyzer',
        'prettier-format',
        '--output',
        makeOutputRoot(),
      ],
      currentProjectRoot: repository.root,
      environment: {},
      stdout: output.stdout,
      stderr: output.stderr,
    });
    expect(exitCode, output.stdoutText + output.stderrText).toBe(0);
    expect(readFileSync(path.join(repository.root, 'lib/changed.ts'), 'utf8')).toBe(
      'export const changed = 3;\n',
    );
    expect(readFileSync(path.join(repository.root, 'lib/legacy/old.ts'), 'utf8')).toBe(
      'export let old=3;\n',
    );
    expect(output.stdoutText).toMatch(/Fixed files:\nlib\/changed.ts\nBase:/);
  });
  it('rejects --fix combined with --all', () => {
    const output = captureOutput();
    expect(
      runCli({ arguments_: ['--fix', '--all'], stdout: output.stdout, stderr: output.stderr }),
    ).toBe(2);
    expect(output.stderrText).toEqual(expectedOutput548_31());
  });
  it('rejects --all combined with --base', () => {
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--all', '--base', 'x'],
      environment: {},
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(2);
    expect(output.stderrText.startsWith('nitpicker failed:')).toBe(true);
  });
  it('prints the single-command usage for --help', () => {
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--help'],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(0);
    expect(output.stdoutText.startsWith('Usage: nitpicker')).toBe(true);
    expect(output.stderrText).toBe('');
  });
});
