import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../cli.mjs';
import { describeConfigOverrides } from '../configuration/config.mjs';
import { policyHash } from '../diff/reporting/report-model.mjs';
import { exactText } from '../diff/reporting/test-support/output-expectations.mjs';
import { policy } from '../diff/execution/test-support/analyzer-findings.mjs';
import { captureOutput } from '../diff/reporting/test-support/output-capture.mjs';
import { fakeAnalyzer, useCliFixtures } from './test-support/cli-harness.mjs';
import { writeFiles } from '../diff/git/test-support/fixture-files.mjs';
import { acceptedDigest } from './test-support/accepted-digest.mjs';
import { linkSentence } from '../../shared/messages/test-support/link-sentence.mjs';

const { createRepository, makeOutputRoot, makeTemporaryRoot, runCli } =
  useCliFixtures(nitpickerCli);

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
    expect(output.stdoutText).toEqual(`
Quality gate summary
✖ 1 new enforceable violation
  second/example src/main/example.ts
    example finding
Full diagnostics: ${root}/combined/report.txt
`);
    expect(output.stderrText).toBe('');
    const summary = JSON.parse(readFileSync(path.join(root, 'combined', 'summary.json'), 'utf8'));
    expect(summary.tools.map(({ name }) => name)).toEqual(['first', 'second']);
    expect(summary.newEnforceableFindings).toBe(1);
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
      interactive: true,
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
  it('works with no config and reports no overrides', () => {
    const { exitCode, summary } = runWithConfig(undefined);

    expect(exitCode).toBe(0);
    expect(summary.configOverrides).toEqual([]);
  });
  it('uses base from the config file', () => {
    const { exitCode, output } = runWithConfig({ base: 'comparison-base' }, { extraArguments: [] });
    const baseLine = output.stdoutText.split('\n').find((line) => line.startsWith('Base: '));

    expect(exitCode).toBe(0);
    expect(baseLine).toBe('Base: comparison-base (config)');
  });
  it('lets an explicit --base win over the config base', () => {
    const { output } = runWithConfig({ base: 'does-not-exist' });

    expect(output.stdoutText).toEqual(
      expect.stringMatching(exactText`Base: HEAD (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[1m\u001b[33mPolicy changed in this change (nitpicker.config.json, head against base):\u001b[0m
  base: not set -> "does-not-exist"
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`),
    );
  });
  it('skips disabled analyzers, reports the override, and changes the policy hash', () => {
    const acceptedPolicyHeading =
      'Policy changed in this change (nitpicker.config.json, head against base; ' +
      'loosening accepted with --accept-policy-change):';
    const analyzers = [fakeAnalyzer(), fakeAnalyzer('second-analyzer')];
    const plain = runWithConfig(undefined, { analyzers });
    const disabled = runWithConfig(
      { disable: ['second-analyzer'] },
      {
        analyzers,
        extraArguments: [
          '--base',
          'HEAD',
          `--accept-policy-change=${acceptedDigest(['analyzer disabled: second-analyzer'], {
            'nitpicker.config.json': JSON.stringify({ disable: ['second-analyzer'] }),
          })}`,
        ],
      },
    );

    expect(plain.summary.tools.map(({ name }) => name)).toEqual([
      'fake-quality-analyzer',
      'second-analyzer',
    ]);
    expect(disabled.summary.tools.map(({ name }) => name)).toEqual(['fake-quality-analyzer']);
    expect(disabled.summary.configOverrides).toEqual(['disable: ["second-analyzer"]']);
    expect(disabled.summary.policyHash).not.toBe(plain.summary.policyHash);
    expect(readFileSync(path.join(disabled.outputRoot, 'report.txt'), 'utf8')).toEqual(
      expect.stringMatching(exactText`Nitpicker quality diff
Base ref: HEAD
Merge base: ${/[a-f0-9]{40}/}
Head: ${/[a-f0-9]{40}/}
Status: completed
New enforceable findings: 0
New findings: 0
Resolved findings: 0
Unchanged findings: 0
Changed metrics: 0
Tool errors: 0

Config overrides:
  disable: ["second-analyzer"]

${acceptedPolicyHeading}
  analyzer disabled: second-analyzer

Per-tool counts:
fake-quality-analyzer: base=0 head=0 new=0 resolved=0 unchanged=0 changed-metrics=0 elapsed=${/[0-9]+(?:\.[0-9]+)?/}s
`),
    );
  });
  it('says on stderr which analyzers a disabled one takes down with it', () => {
    const dependent = {
      ...fakeAnalyzer('dependent-analyzer'),
      dependencies: ['fake-quality-analyzer'],
    };
    const analyzers = [fakeAnalyzer(), dependent, fakeAnalyzer('other-analyzer')];

    const config = { disable: ['fake-quality-analyzer'] };
    const digest = acceptedDigest(['analyzer disabled: fake-quality-analyzer'], {
      'nitpicker.config.json': JSON.stringify(config),
    });
    const { exitCode, output, summary } = runWithConfig(config, {
      analyzers,
      extraArguments: ['--base', 'HEAD', `--accept-policy-change=${digest}`],
    });

    expect(exitCode).toBe(0);
    expect(summary.tools.map(({ name }) => name)).toEqual(['other-analyzer']);
    expect(output.stderrText).toBe(
      'nitpicker: fake-quality-analyzer is disabled, so dependent-analyzer is off too\n',
    );
  });
  it('rejects disabling an unknown analyzer', () => {
    const { exitCode, output } = runConfigOnly({ disable: ['nope'] });

    expect(exitCode).toBe(2);
    expect(output.stderrText).toEqual(
      `nitpicker failed: nitpicker.config.json: "disable" names unknown analyzers: nope. Known analyzers: fake-quality-analyzer. ${linkSentence('invalidConfiguration')}\n`,
    );
  });
  it('reports every parsed key and changes the policy hash for each', () => {
    // Keys in describeConfigOverrides order. One run covers the CLI wiring for most of them.
    // `exclude` gets its own run: with it set, the layout-only branch of applyLayout is skipped.
    const entries = [
      ['preset', 'typescript'],
      ['thresholds', { crapLimit: 8 }],
      ['layout', { sourceRoots: ['src', 'lib'] }],
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
      expect(tool).toEqual({
        name: 'custom',
        version: 'custom',
        configurationHash: expect.stringMatching(exactText`${/[a-f0-9]{64}/}`),
        base: 1,
        head: 2,
        new: 1,
        resolved: 0,
        unchanged: 1,
        changedMetrics: 0,
        baseElapsedMs: expect.any(Number),
        headElapsedMs: expect.any(Number),
        elapsedMs: expect.any(Number),
      });
      expect(output.stdoutText).toEqual(`Base: ${repository.baseRef} (argument)

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mcustom/text-file\u001b[0m src/main/new.txt
    Text file new.txt
\u001b[1m\u001b[33mPolicy changed in this change (nitpicker.config.json, head against base):\u001b[0m
  analyzer added: custom
\u001b[2mFull diagnostics: ${outputRoot}/report.txt\u001b[0m
`);
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
      expect(output.stderrText).toEqual(
        `nitpicker failed: nitpicker.config.json: analyzers entry "fake-quality-analyzer" clashes with another analyzer name. ${linkSentence('invalidConfiguration')}\n`,
      );
    });
  });
});
