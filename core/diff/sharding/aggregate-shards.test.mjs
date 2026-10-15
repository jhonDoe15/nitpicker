import { createGitTemplate, copyGitTemplate } from '../fixtures/git-repository.mjs';
import {
  expectedOutput129_79,
  expectedOutput157_79,
  expectedOutput302_31,
  expectedOutput303_31,
  expectedOutput304_31,
  expectedOutput305_31,
  expectedOutput371_31,
  expectedOutput372_31,
  expectedOutput373_31,
} from '../fixtures/expected-output/core-diff-aggregate-shards.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { aggregateShardReports, runAggregateCli } from './aggregate-shards.mjs';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function analyzer(name, { dependencies = [], shardWeight = 1 } = {}) {
  return {
    name,
    version: '1.0.0',
    configurationHash: `hash-${name}`,
    exclusions: ['generated/**'],
    dependencies,
    shardWeight,
  };
}

function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'quality-shards-'));
  temporaryDirectories.push(root);
  return {
    inputRoot: path.join(root, 'shards'),
    outputRoot: path.join(root, 'combined'),
  };
}

function writeShard(
  inputRoot,
  index,
  {
    tools,
    headSha = 'head',
    findings = [],
    held,
    toolErrors = [],
    toolVersions = {},
    configurationHashes = {},
    overallStatus = 'completed',
    elapsedMs = 10,
  },
) {
  const shardRoot = path.join(inputRoot, String(index));
  mkdirSync(shardRoot, { recursive: true });
  writeJson(path.join(shardRoot, 'summary.json'), {
    requestedBaseRef: 'origin/master',
    resolvedBaseSha: 'base',
    mergeBaseSha: 'merge-base',
    headSha,
    policyHash: `shard-${String(index)}`,
    tools: tools.map((name) => ({
      name,
      version: toolVersions[name] ?? '1.0.0',
      configurationHash: configurationHashes[name] ?? `hash-${name}`,
      base: 0,
      head: 0,
      new: findings.filter(({ tool }) => tool === name).length,
      resolved: 0,
      unchanged: 0,
      changedMetrics: 0,
      baseElapsedMs: 3,
      headElapsedMs: 5,
      elapsedMs: 8,
    })),
    exclusions: ['generated/**'],
    renamedPaths: 0,
    elapsedMs,
    overallStatus,
    newEnforceableFindings: findings.length,
  });
  writeJson(path.join(shardRoot, 'new-findings.json'), findings);
  writeJson(path.join(shardRoot, 'resolved-findings.json'), []);
  writeJson(path.join(shardRoot, 'changed-metrics.json'), []);
  if (held !== undefined) {
    writeJson(path.join(shardRoot, 'held-findings.json'), held);
  }
  writeJson(path.join(shardRoot, 'tool-errors.json'), toolErrors);
}

describe('quality shard aggregation', () => {
  it('merges complete shards into one ordered report and final gate', () => {
    const fixture = createFixture();
    const analyzers = [
      analyzer('largest', { shardWeight: 9 }),
      analyzer('coverage', { shardWeight: 6 }),
      analyzer('crap', { dependencies: ['coverage'], shardWeight: 2 }),
      analyzer('medium', { shardWeight: 5 }),
      analyzer('small', { shardWeight: 4 }),
    ];
    const finding = {
      tool: 'small',
      rule: 'example',
      path: 'src/main/example.ts',
      identity: 'example',
      message: 'example finding',
      classification: 'enforceable',
    };
    writeShard(fixture.inputRoot, 0, { tools: ['largest'], elapsedMs: 30 });
    writeShard(fixture.inputRoot, 1, {
      tools: ['coverage', 'crap'],
      elapsedMs: 40,
    });
    writeShard(fixture.inputRoot, 2, {
      tools: ['medium', 'small'],
      findings: [finding],
      elapsedMs: 20,
    });

    const report = aggregateShardReports({
      ...fixture,
      analyzers,
      shardCount: 3,
    });

    expect(report.summary.tools.map(({ name }) => name)).toEqual(analyzers.map(({ name }) => name));
    expect(report.summary.elapsedMs).toBe(40);
    expect(report.summary.newEnforceableFindings).toBe(1);
    expect(report.newFindings).toEqual([finding]);
    expect(readJson(fixture.outputRoot, 'summary.json')).toEqual(report.summary);
    expect(readFileSync(path.join(fixture.outputRoot, 'report.txt'), 'utf8')).toEqual(
      expectedOutput129_79(),
    );
  });

  it('carries the held findings of every shard into the report and its note', () => {
    const fixture = createFixture();
    const held = {
      tool: 'structure',
      rule: 'function-lines-limit',
      path: 'src/main/invoice.ts',
      identity: 'function:computeInvoice',
      message: 'computeInvoice has 68 lines; limit is 50',
      classification: 'enforceable',
      heldAtBase: 68,
      ratchet: { key: 'k', value: 68, worseMessage: 'grew from {base}' },
    };
    writeShard(fixture.inputRoot, 0, { tools: ['structure'], held: [held] });
    writeShard(fixture.inputRoot, 1, { tools: ['other'] });

    const report = aggregateShardReports({
      ...fixture,
      analyzers: [analyzer('structure'), analyzer('other')],
      shardCount: 2,
    });

    expect(report.unchangedFindings).toEqual([held]);
    expect(readJson(fixture.outputRoot, 'held-findings.json')).toEqual([held]);
    expect(readFileSync(path.join(fixture.outputRoot, 'report.txt'), 'utf8')).toEqual(
      expectedOutput157_79(),
    );
  });

  it('uses the shard head policy when the live inventory has uncommitted changes', () => {
    const fixture = createFixture();
    const repositoryRoot = path.join(path.dirname(fixture.inputRoot), 'repository');
    const liveProjectRoot = path.join(repositoryRoot, 'project');
    const inventoryPath = path.join(liveProjectRoot, 'nitpicker.legacy.json');
    mkdirSync(liveProjectRoot, { recursive: true });
    writeFileSync(inventoryPath, '{"sites":["head"]}');
    copyGitTemplate(gitTemplate.root, repositoryRoot);
    runGitCommand(repositoryRoot, ['config', 'user.name', 'Nitpicker Test']);
    runGitCommand(repositoryRoot, ['config', 'user.email', 'nitpicker-test@example.com']);
    runGitCommand(repositoryRoot, ['add', '--all']);
    runGitCommand(repositoryRoot, ['commit', '--quiet', '-m', 'head policy']);
    const headSha = runGitCommand(repositoryRoot, ['rev-parse', 'HEAD']);
    writeFileSync(inventoryPath, '{"sites":["live"]}');

    const codingStandards = analyzer('coding-standards');
    codingStandards.resolveVersion = () => '1.0.0';
    codingStandards.resolveConfigurationHash = (root) =>
      readFileSync(path.join(root, 'nitpicker.legacy.json'), 'utf8');
    const headPolicyHash = '{"sites":["head"]}';
    writeShard(fixture.inputRoot, 0, {
      tools: ['coding-standards'],
      headSha,
      configurationHashes: { 'coding-standards': headPolicyHash },
    });

    const report = aggregateShardReports({
      ...fixture,
      analyzers: [codingStandards],
      shardCount: 1,
      liveProjectRoot,
    });

    expect(report.summary.overallStatus).toBe('completed');
    expect(report.summary.tools[0].configurationHash).toBe(headPolicyHash);
  });

  it('records shard-classified analyzer tool errors without aborting aggregation', () => {
    const fixture = createFixture();
    const error = {
      tool: 'missing-tool',
      snapshot: 'head',
      message: 'Required tool missing-tool is not installed',
    };
    const missingTool = analyzer('missing-tool');
    missingTool.version = 'unresolved';
    missingTool.resolveVersion = () => {
      throw new Error(error.message);
    };
    writeShard(fixture.inputRoot, 0, {
      tools: ['missing-tool'],
      toolErrors: [error],
      toolVersions: { 'missing-tool': 'unknown' },
      overallStatus: 'tool-error',
    });

    const report = aggregateShardReports({
      ...fixture,
      analyzers: [missingTool],
      shardCount: 1,
      liveProjectRoot: PACKAGE_ROOT,
    });

    expect(report.summary.overallStatus).toBe('tool-error');
    expect(report.summary.tools[0].version).toBe('unknown');
    expect(report.toolErrors).toEqual([error]);
  });

  it('rejects a missing shard instead of silently reducing analyzer coverage', () => {
    const fixture = createFixture();
    const analyzers = [analyzer('a'), analyzer('b')];
    writeShard(fixture.inputRoot, 0, { tools: ['a'] });

    expect(() =>
      aggregateShardReports({
        ...fixture,
        analyzers,
        shardCount: 2,
      }),
    ).toThrow(/shard 1.*summary\.json/i);
  });

  it('rejects misassigned shard reports', () => {
    const fixture = createFixture();
    const analyzers = [analyzer('a'), analyzer('b')];
    writeShard(fixture.inputRoot, 0, { tools: ['a'] });
    writeShard(fixture.inputRoot, 1, { tools: ['a'] });

    expect(() =>
      aggregateShardReports({
        ...fixture,
        analyzers,
        shardCount: 2,
      }),
    ).toThrow(/expected analyzers b/i);
  });

  it('rejects shard reports produced from different commits', () => {
    const fixture = createFixture();
    const analyzers = [analyzer('a'), analyzer('b')];
    writeShard(fixture.inputRoot, 0, { tools: ['a'] });
    writeShard(fixture.inputRoot, 1, { tools: ['b'], headSha: 'stale-head' });

    expect(() =>
      aggregateShardReports({
        ...fixture,
        analyzers,
        shardCount: 2,
      }),
    ).toThrow(/shard 1 headSha does not match shard 0/i);
  });

  it('returns the combined enforceable gate status', () => {
    const fixture = createFixture();
    const analyzers = [analyzer('only')];
    writeShard(fixture.inputRoot, 0, {
      tools: ['only'],
      findings: [
        {
          tool: 'only',
          rule: 'example',
          path: 'src/main/example.ts',
          identity: 'example',
          message: 'example finding',
          classification: 'enforceable',
        },
      ],
    });
    const output = captureOutput();

    const exitCode = runAggregateCli({
      arguments_: ['--input-root', 'shards', '--shard-count', '1', '--output', 'combined'],
      currentProjectRoot: path.dirname(fixture.inputRoot),
      analyzers,
      stdout: output.stdout,
      stderr: output.stderr,
      environment: {},
    });

    expect(exitCode).toBe(1);
    expect(output.stdoutText).toEqual(expectedOutput302_31({ fixture }));
    expect(output.stdoutText).toEqual(expectedOutput303_31({ fixture }));
    expect(output.stdoutText).toEqual(expectedOutput304_31({ fixture }));
    expect(output.stdoutText).toEqual(expectedOutput305_31({ fixture }));
    expect(output.stdoutText).not.toContain('Per-tool counts:');
    expect(output.stderrText).toBe('');
  });

  it.each([
    ['findings plus a tool error', true, true, 1],
    ['a tool error only', false, true, 2],
    ['findings only', true, false, 1],
    ['a clean run', false, false, 0],
  ])('exits per the combined result for %s', (_name, withFinding, withToolError, expected) => {
    const fixture = createFixture();
    const analyzers = [analyzer('only')];
    writeShard(fixture.inputRoot, 0, {
      tools: ['only'],
      findings: withFinding
        ? [
            {
              tool: 'only',
              rule: 'example',
              path: 'src/main/example.ts',
              identity: 'example',
              message: 'example finding',
              classification: 'enforceable',
            },
          ]
        : [],
      toolErrors: withToolError
        ? [{ tool: 'only', rule: 'tool-error', path: '', identity: 'boom', message: 'boom' }]
        : [],
      overallStatus: withToolError ? 'tool-error' : 'completed',
    });
    const output = captureOutput();

    const exitCode = runAggregateCli({
      arguments_: ['--input-root', 'shards', '--shard-count', '1', '--output', 'combined'],
      currentProjectRoot: path.dirname(fixture.inputRoot),
      analyzers,
      stdout: output.stdout,
      stderr: output.stderr,
      environment: {},
    });

    expect(exitCode).toBe(expected);
    const summary = JSON.parse(
      readFileSync(path.join(path.dirname(fixture.inputRoot), 'combined/summary.json'), 'utf8'),
    );
    expect(summary.overallStatus).toBe(withToolError ? 'tool-error' : 'completed');
  });

  it('supports a concise color-free success summary', () => {
    const fixture = createFixture();
    const analyzers = [analyzer('only')];
    writeShard(fixture.inputRoot, 0, { tools: ['only'] });
    const output = captureOutput();

    const exitCode = runAggregateCli({
      arguments_: ['--input-root', 'shards', '--shard-count', '1', '--output', 'combined'],
      currentProjectRoot: path.dirname(fixture.inputRoot),
      analyzers,
      stdout: output.stdout,
      stderr: output.stderr,
      environment: { NO_COLOR: '1' },
    });

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toEqual(expectedOutput371_31({ fixture }));
    expect(output.stdoutText).toEqual(expectedOutput372_31({ fixture }));
    expect(output.stdoutText).toEqual(expectedOutput373_31({ path, fixture }));
    expect(output.stdoutText).not.toContain('\u001B[');
    expect(output.stderrText).toBe('');
  });

  it('starts without importing any development dependency', () => {
    const fixture = createFixture();
    const loaderPath = path.join(path.dirname(fixture.inputRoot), 'block-packages-loader.mjs');
    writeFileSync(
      loaderPath,
      [
        'export function resolve(specifier, context, nextResolve) {',
        "  if (!specifier.startsWith('.') && !specifier.startsWith('/') &&",
        "      !specifier.startsWith('file:') && !specifier.startsWith('node:')) {",
        '    throw new Error(`Blocked external package: ${specifier}`);',
        '  }',
        '  return nextResolve(specifier, context);',
        '}',
      ].join('\n'),
    );

    const result = spawnSync(
      process.execPath,
      [
        '--experimental-loader',
        loaderPath,
        new URL('./aggregate-shards.mjs', import.meta.url).pathname,
        '--help',
      ],
      { encoding: 'utf8' },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(
      'Usage: node core/diff/sharding/aggregate-shards.mjs --input-root <directory> --shard-count <count> [--output <directory>] [--policy-root <directory>]\n',
    );
  });
});

function runGitCommand(repositoryRoot, arguments_) {
  const result = spawnSync('git', arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.error?.message || 'git command failed');
  }
  return result.stdout.trim();
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(root, name) {
  return JSON.parse(readFileSync(path.join(root, name), 'utf8'));
}

function captureOutput() {
  let stdoutText = '';
  let stderrText = '';
  return {
    stdout: { write: (value) => (stdoutText += value) },
    stderr: { write: (value) => (stderrText += value) },
    get stdoutText() {
      return stdoutText;
    },
    get stderrText() {
      return stderrText;
    },
  };
}

const gitTemplate = { root: undefined };
beforeAll(() => {
  gitTemplate.root = createGitTemplate();
});
