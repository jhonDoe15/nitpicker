import { createGitTemplate, copyGitTemplate } from './git-repository.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll } from 'vitest';
import { runTasksInProcess } from './in-process-analyzers.mjs';

const discardedProgress = { write() {} };

const cliUnderTest = { runCli: undefined };

export function runCli(options) {
  return cliUnderTest.runCli({
    runTasks: runTasksInProcess,
    progress: discardedProgress,
    ...options,
  });
}

const fakeAnalyzerPath = path.join(import.meta.dirname, 'fake-analyzer.mjs');

const temporaryRoots = [];

export function createRepository(initialFiles) {
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

export function fakeAnalyzer(name = 'fake-quality-analyzer') {
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

export function crashingAnalyzer() {
  return {
    ...fakeAnalyzer('crashing-analyzer'),
    createInvocation({ policyRoot }) {
      return {
        command: process.execPath,
        args: ['-e', 'process.exit(2)'],
        cwd: policyRoot,
      };
    },
  };
}

export function finding(overrides = {}) {
  return {
    tool: 'fake-quality-analyzer',
    rule: 'fixture-rule',
    identity: 'fixture-identity',
    message: 'Fixture finding',
    classification: 'enforceable',
    ...overrides,
  };
}

export function findingLine(value) {
  return `// QUALITY_FINDING ${JSON.stringify(value)}\n`;
}

export function policy() {
  return `${JSON.stringify({ marker: 'QUALITY_FINDING' }, null, 2)}\n`;
}

export function writeFiles(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}

export function commit(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
}

const gitFixtureEnvironment = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

export function git(root, arguments_) {
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

export function makeTemporaryRoot(prefix) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

export function makeOutputRoot() {
  return path.join(makeTemporaryRoot('nitpicker-cli-output-'), 'reports');
}

export function captureOutput() {
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

export function useCliFixtures(runNitpickerCli) {
  cliUnderTest.runCli = runNitpickerCli;
  beforeAll(() => {
    gitTemplate.root = createGitTemplate();
  });
  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
