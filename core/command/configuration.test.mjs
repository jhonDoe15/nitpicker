import { createGitTemplate, copyGitTemplate } from '../diff/fixtures/git-repository.mjs';
import {
  expectedOutput644_31,
  expectedOutput721_31,
  expectedOutput727_31,
  expectedOutput742_80,
  expectedOutput751_31,
  expectedOutput810_20,
  expectedOutput811_33,
  expectedOutput834_33,
} from '../diff/fixtures/expected-output/core-cli.mjs';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
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
import { policyHash } from '../diff/reporting/report-model.mjs';
import { describeConfigOverrides } from '../configuration/config.mjs';

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

function customAnalyzerEntry(mode) {
  return { name: 'custom', command: process.execPath, args: ['custom-analyzer.mjs', mode] };
}

describe('nitpicker CLI', () => {
  it('merges two shard reports through the aggregate subcommand', () => {
    const root = realpathSync(makeTemporaryRoot('nitpicker-cli-aggregate-'));
    const analyzers = ['first', 'second'].map((name) => ({
      name,
      version: '1.0.0',
      configurationHash: `hash-${name}`,
      exclusions: [],
      dependencies: [],
      shardWeight: 1,
    }));
    const finding = {
      tool: 'second',
      rule: 'example',
      path: 'src/main/example.ts',
      identity: 'example',
      message: 'example finding',
      classification: 'enforceable',
    };
    for (const [index, { name }] of analyzers.entries()) {
      const findings = index === 1 ? [finding] : [];
      const shardRoot = path.join(root, 'shards', String(index));
      mkdirSync(shardRoot, { recursive: true });
      const files = {
        'summary.json': {
          requestedBaseRef: 'origin/main',
          resolvedBaseSha: 'base',
          mergeBaseSha: 'merge-base',
          headSha: 'head',
          policyHash: `shard-${String(index)}`,
          tools: [{ name, version: '1.0.0', configurationHash: `hash-${name}` }],
          exclusions: [],
          renamedPaths: 0,
          elapsedMs: 10,
          overallStatus: 'completed',
          newEnforceableFindings: findings.length,
        },
        'new-findings.json': findings,
        'resolved-findings.json': [],
        'changed-metrics.json': [],
        'tool-errors.json': [],
      };
      for (const [fileName, value] of Object.entries(files)) {
        writeFileSync(path.join(shardRoot, fileName), JSON.stringify(value));
      }
    }
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: [
        'aggregate',
        '--input-root',
        'shards',
        '--shard-count',
        '2',
        '--output',
        'combined',
      ],
      environment: { NO_COLOR: '1' },
      currentProjectRoot: root,
      analyzers,
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(1);
    expect(output.stdoutText).toEqual(expectedOutput644_31({ root }));
    expect(output.stderrText).toBe('');
    const summary = JSON.parse(readFileSync(path.join(root, 'combined', 'summary.json'), 'utf8'));
    expect(summary.tools.map(({ name }) => name)).toEqual(['first', 'second']);
    expect(summary.newEnforceableFindings).toBe(1);
  });
  it('runs when launched through a symlinked bin', () => {
    const binPath = path.join(makeTemporaryRoot('nitpicker-cli-bin-'), 'nitpicker');
    symlinkSync(path.join(new URL('../', import.meta.url).pathname, 'cli.mjs'), binPath);

    const stdout = execFileSync(process.execPath, [binPath, '--help'], {
      encoding: 'utf8',
    });

    expect(stdout.startsWith('Usage: nitpicker')).toBe(true);
  });
});
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
  it('works with no config and reports no overrides', () => {
    const { exitCode, summary } = runWithConfig(undefined);

    expect(exitCode).toBe(0);
    expect(summary.configOverrides).toEqual([]);
  });
  it('uses base from the config file', () => {
    const { exitCode, output } = runWithConfig({ base: 'HEAD' }, { extraArguments: [] });

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toEqual(expectedOutput721_31());
  });
  it('lets an explicit --base win over the config base', () => {
    const { output } = runWithConfig({ base: 'does-not-exist' });

    expect(output.stdoutText).toEqual(expectedOutput727_31());
  });
  it('skips disabled analyzers, reports the override, and changes the policy hash', () => {
    const analyzers = [fakeAnalyzer(), fakeAnalyzer('second-analyzer')];
    const plain = runWithConfig(undefined, { analyzers });
    const disabled = runWithConfig({ disable: ['second-analyzer'] }, { analyzers });

    expect(plain.summary.tools.map(({ name }) => name)).toEqual([
      'fake-quality-analyzer',
      'second-analyzer',
    ]);
    expect(disabled.summary.tools.map(({ name }) => name)).toEqual(['fake-quality-analyzer']);
    expect(disabled.summary.configOverrides).toEqual(['disable: ["second-analyzer"]']);
    expect(disabled.summary.policyHash).not.toBe(plain.summary.policyHash);
    expect(readFileSync(path.join(disabled.outputRoot, 'report.txt'), 'utf8')).toEqual(
      expectedOutput742_80(),
    );
  });
  it('rejects disabling an unknown analyzer', () => {
    const { exitCode, output } = runConfigOnly({ disable: ['nope'] });

    expect(exitCode).toBe(2);
    expect(output.stderrText).toEqual(expectedOutput751_31());
  });
  it('reports every parsed key and changes the policy hash for each', () => {
    // Keys in describeConfigOverrides order. One run covers the CLI wiring for most of them.
    // `exclude` gets its own run: with it set, the layout-only branch of applyLayout is skipped.
    const entries = [
      ['preset', 'typescript'],
      ['thresholds', { crapLimit: 12 }],
      ['layout', { sourceRoots: ['lib'] }],
      ['analyzers', [customAnalyzerEntry('clean')]],
      ['legacyInventory', 'config/legacy.json'],
    ];
    const plainHash = runWithConfig(undefined).summary.policyHash;
    const { summary, exitCode } = runWithConfig(Object.fromEntries(entries));
    expect(exitCode).toBe(0);
    expect(summary.configOverrides).toEqual(
      entries.map(
        ([key, value]) =>
          `${typeof key === 'string' ? key : JSON.stringify(key)}: ${JSON.stringify(value)}`,
      ),
    );
    expect(summary.policyHash).not.toBe(plainHash);
    const excluded = runWithConfig({ exclude: ['generated/**'] });
    expect(excluded.exitCode).toBe(0);
    expect(excluded.summary.configOverrides).toEqual(['exclude: ["generated/**"]']);
    expect(excluded.summary.policyHash).not.toBe(plainHash);
    // Each key alone must change the hash, computed with the same functions the CLI uses.
    const analyzers = [fakeAnalyzer()];
    for (const [key, value] of [...entries, ['exclude', ['generated/**']]]) {
      expect(policyHash(analyzers, describeConfigOverrides({ [key]: value }))).not.toBe(
        policyHash(analyzers),
      );
    }
  });
  describe('custom analyzers', () => {
    it('classifies findings from a valid analyzer like built-in findings', () => {
      const repository = createRepository({
        'quality-policy.json': policy(),
        'custom-analyzer.mjs': customAnalyzerScript,
        'src/main/old.txt': 'legacy\n',
      });
      writeFiles(repository.root, {
        'nitpicker.config.json': JSON.stringify({ analyzers: [customAnalyzerEntry('files')] }),
        'src/main/new.txt': 'added\n',
      });
      const output = captureOutput();
      const outputRoot = makeOutputRoot();

      const exitCode = runCli({
        arguments_: ['--base', repository.baseRef, '--output', outputRoot],
        environment: {},
        currentProjectRoot: repository.root,
        analyzers: [fakeAnalyzer()],
        stdout: output.stdout,
        stderr: output.stderr,
      });

      const summary = JSON.parse(readFileSync(path.join(outputRoot, 'summary.json'), 'utf8'));
      const tool = summary.tools.find(({ name }) => name === 'custom');
      expect(exitCode).toBe(1);
      expect(tool).toEqual(expectedOutput810_20());
      expect(output.stdoutText).toEqual(expectedOutput811_33({ repository, outputRoot }));
    });
    it.each([
      ['json', /custom did not produce valid JSON/],
      ['shape', /custom output must contain a findings array/],
      ['crash', /custom crashed with exit 3: custom analyzer failed/],
    ])('reports a %s failure as a tool error', (mode, message) => {
      const { exitCode, output, summary } = runWithConfig({
        analyzers: [customAnalyzerEntry(mode)],
      });

      expect(exitCode).toBe(2);
      expect(summary.overallStatus).toBe('tool-error');
      expect(output.stdoutText).toMatch(message);
    });
    it('rejects a name that clashes with a built-in analyzer', () => {
      const { exitCode, output } = runConfigOnly({
        analyzers: [{ ...customAnalyzerEntry('clean'), name: 'fake-quality-analyzer' }],
      });

      expect(exitCode).toBe(2);
      expect(output.stderrText).toEqual(expectedOutput834_33());
    });
  });
});
