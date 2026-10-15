import { createGitTemplate, copyGitTemplate } from '../diff/fixtures/git-repository.mjs';

import {
  expectedOutput944_38,
  expectedOutput1011_43,
  expectedOutput1017_40,
  expectedOutput1031_40,
  expectedOutput1045_40,
} from '../diff/fixtures/expected-output/core-cli.mjs';

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

import { startTestHttpServer } from '../diff/cache/test-http-server.mjs';

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

function finding(overrides = {}) {
  return {
    tool: 'fake-quality-analyzer',
    rule: 'fixture-rule',
    identity: 'fixture-identity',
    message: 'Fixture finding',
    classification: 'enforceable',
    ...overrides,
  };
}

function findingLine(value) {
  return `// QUALITY_FINDING ${JSON.stringify(value)}\n`;
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

const customAnalyzerScript = `import { existsSync, readdirSync } from 'node:fs';
const mode = process.argv[2];
if (mode === 'crash') {
  process.stderr.write('custom analyzer failed\\n');
  process.exit(3);
}
if (mode === 'json') {
  process.stdout.write('{not-json');
} else if (mode === 'shape') {
  process.stdout.write('{"items":[]}');
} else {
  const files = mode === 'files' && existsSync('src/main') ? readdirSync('src/main').sort() : [];
  const findings = files
    .filter((file) => file.endsWith('.txt'))
    .map((file) => ({
      tool: 'custom',
      rule: 'text-file',
      path: 'src/main/' + file,
      identity: 'text-file:' + file,
      message: 'Text file ' + file,
      classification: 'enforceable',
    }));
  process.stdout.write(JSON.stringify({ findings }));
}
`;

describe('nitpicker config file', () => {
  // Config errors are raised before any git work, so these need only the config file.
  function runConfigOnly(config) {
    const projectRoot = makeTemporaryRoot('nitpicker-cli-config-');
    writeFiles(projectRoot, {
      'nitpicker.config.json': typeof config === 'string' ? config : JSON.stringify(config),
    });
    const output = captureOutput();
    const exitCode = runCli({
      arguments_: ['--output', makeOutputRoot()],
      environment: {},
      currentProjectRoot: projectRoot,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });
    return { exitCode, output };
  }
  function runWithConfig(config, { extraArguments = ['--base', 'HEAD'], analyzers } = {}) {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
      'custom-analyzer.mjs': customAnalyzerScript,
    });
    if (config !== undefined) {
      writeFiles(repository.root, {
        'nitpicker.config.json': typeof config === 'string' ? config : JSON.stringify(config),
      });
    }
    const output = captureOutput();
    const outputRoot = makeOutputRoot();
    const exitCode = runCli({
      arguments_: ['--output', outputRoot, ...extraArguments],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: analyzers ?? [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });
    const summaryPath = path.join(outputRoot, 'summary.json');
    const summary = existsSync(summaryPath)
      ? JSON.parse(readFileSync(summaryPath, 'utf8'))
      : undefined;
    return { exitCode, output, summary, outputRoot };
  }
  it('reports a strict exception and changes the policy hash', () => {
    const exception = {
      rule: 'nitpicker/preserve-error-cause',
      paths: ['src/legacy/**'],
      reason: 'Legacy module until migration',
    };
    const plain = runWithConfig(undefined).summary.policyHash;
    const { summary, exitCode } = runWithConfig({ exceptions: [exception] });
    expect(exitCode).toBe(0);
    expect(summary.configOverrides).toEqual([`exception: ${JSON.stringify(exception)}`]);
    expect(summary.policyHash).not.toBe(plain);
  });
  it.each([
    [{ unknownKey: true }, /unknown key "unknownKey"/],
    [{ preset: 'strict' }, /"preset" must be one of: typescript/],
    [{ thresholds: { crapLimit: 'x' } }, /positive number/],
    [{ thresholds: { other: 1 } }, /unknown threshold "other"/],
    [
      { legacyInventory: '/abs/legacy.json' },
      /"legacyInventory" must be a path inside the project/,
    ],
    [{ legacyInventory: '../legacy.json' }, /"legacyInventory" must be a path inside the project/],
    [{ legacyInventory: '' }, /"legacyInventory" must be a non-empty string/],
    [{ base: '' }, /"base" must be a non-empty string/],
    [{ analyzers: [{ name: 'a' }] }, /needs a non-empty "name" and "command"/],
    ['{not json', /not valid JSON/],
  ])('fails for an invalid config %j', (config, message) => {
    const { exitCode, output } = runConfigOnly(config);

    expect(exitCode).toBe(2);
    expect(output.stderrText).toMatch(message);
  });
});
describe('findings cache', () => {
  function setup() {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/old.ts': findingLine(finding({ identity: 'old-finding' })),
    });
    writeFiles(repository.root, {
      'src/main/new.ts': findingLine(finding({ identity: 'new-finding' })),
    });
    const cacheDirectory = makeTemporaryRoot('nitpicker-cli-cache-');
    const snapshots = [];
    const run = ({ extraArguments = [], configurationHash = 'fixture-policy' } = {}) => {
      const analyzer = fakeAnalyzer();
      analyzer.configurationHash = configurationHash;
      const createInvocation = analyzer.createInvocation.bind(analyzer);
      analyzer.createInvocation = (context) => {
        snapshots.push(context.snapshot);
        return createInvocation(context);
      };
      const output = captureOutput();
      const exitCode = runCli({
        arguments_: ['--base', repository.baseRef, '--output', makeOutputRoot(), ...extraArguments],
        environment: { NITPICKER_CACHE_DIR: cacheDirectory },
        currentProjectRoot: repository.root,
        analyzers: [analyzer],
        stdout: output.stdout,
        stderr: output.stderr,
      });
      return { exitCode, output };
    };
    return { run, snapshots };
  }
  it('skips base analysis on a second run against the same base', () => {
    const { run, snapshots } = setup();

    const first = run();
    const second = run();

    expect(first.exitCode).toBe(1);
    expect(second.exitCode).toBe(1);
    expect(second.output.stdoutText).toEqual(expectedOutput944_38());
    expect(snapshots).toEqual(['base', 'head', 'head']);
  });
  it('analyzes the base again with --no-cache', () => {
    const { run, snapshots } = setup();

    run();
    run({ extraArguments: ['--no-cache'] });

    expect(snapshots).toEqual(['base', 'head', 'base', 'head']);
  });
  it('analyzes the base again when the head policy hash changes', () => {
    const { run, snapshots } = setup();

    run();
    run({ configurationHash: 'changed-policy' });

    expect(snapshots).toEqual(['base', 'head', 'base', 'head']);
  });
});
describe('remote findings cache', () => {
  async function setup() {
    const remote = await startTestHttpServer();
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/old.ts': findingLine(finding({ identity: 'old-finding' })),
    });
    writeFiles(repository.root, {
      'src/main/new.ts': findingLine(finding({ identity: 'new-finding' })),
    });
    const snapshots = [];
    const execute = (arguments_, url = remote.url, { subprocess = false } = {}) => {
      const analyzer = fakeAnalyzer();
      const createInvocation = analyzer.createInvocation.bind(analyzer);
      analyzer.createInvocation = (context) => {
        snapshots.push(context.snapshot);
        return createInvocation(context);
      };
      const output = captureOutput();
      const exitCode = runCli({
        arguments_,
        environment: {
          NITPICKER_CACHE_DIR: makeTemporaryRoot('nitpicker-cli-cache-'),
          NITPICKER_CACHE_URL: url,
        },
        currentProjectRoot: repository.root,
        analyzers: [analyzer],
        stdout: output.stdout,
        stderr: output.stderr,
        runTasks: subprocess ? undefined : runTasksInProcess,
      });
      return { exitCode, output };
    };
    const compare = (url) =>
      execute(['--base', repository.baseRef, '--output', makeOutputRoot()], url);
    return { remote, snapshots, execute, compare };
  }
  it('publishes a base snapshot that a fresh checkout then reuses', async () => {
    const { remote, snapshots, execute, compare } = await setup();
    try {
      // The real scheduler subprocess publishes; the comparison then runs in-process.
      const published = execute(['cache', 'publish'], remote.url, { subprocess: true });
      expect(published.exitCode).toBe(0);
      expect(published.output.stdoutText).toEqual(expectedOutput1011_43());
      expect(await remote.keys()).toHaveLength(1);

      const result = compare();

      expect(result.exitCode).toBe(1);
      expect(result.output.stdoutText).toEqual(expectedOutput1017_40());
      expect(snapshots).toEqual(['base', 'head']);
    } finally {
      await remote.close();
    }
  });
  it('still gates when the remote cache is unreachable', async () => {
    const { remote, snapshots, compare } = await setup();
    await remote.failWith(500);
    try {
      const result = compare();

      expect(result.exitCode).toBe(1);
      expect(result.output.stdoutText).toEqual(expectedOutput1031_40());
      expect(snapshots).toEqual(['base', 'head']);
    } finally {
      await remote.close();
    }
  });
  it('fails publishing without a remote URL, and reports an unreachable one', async () => {
    const { remote, execute } = await setup();
    try {
      expect(execute(['cache', 'publish'], '').exitCode).toBe(2);
      await remote.failWith(500);
      const result = execute(['cache', 'publish']);
      expect(result.exitCode).toBe(2);
      expect(result.output.stdoutText).toEqual(expectedOutput1045_40());
    } finally {
      await remote.close();
    }
  });
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
  it('prints a start line per phase to stderr and leaves out quick successful analyzers', () => {
    const { run } = setup();

    const { exitCode, output } = run();

    expect(exitCode).toBe(0);
    expect(output.stderrText.split('\n').filter(Boolean)).toEqual([
      'nitpicker: base: running 1 analyzer',
      'nitpicker: head: running 1 analyzer',
    ]);
    expect(output.stdoutText).not.toContain('nitpicker: head');
  });
});
