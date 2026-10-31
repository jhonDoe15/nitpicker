import { readFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../cli.mjs';
import { exactText } from '../diff/reporting/test-support/output-expectations.mjs';
import { policy } from '../diff/execution/test-support/analyzer-findings.mjs';
import { captureOutput } from '../diff/reporting/test-support/output-capture.mjs';
import { fixtureGit } from '../diff/git/test-support/git-repository.mjs';
import { fakeAnalyzer, useCliFixtures } from './test-support/cli-harness.mjs';
import { fileURLToPath } from 'node:url';
import { writeFiles } from '../diff/git/test-support/fixture-files.mjs';
import { PROJECT_LAYER_VARIABLE } from '../../languages/typescript/adapters/lint-engine/project-layer.mjs';

const { createRepository, makeOutputRoot, makeTemporaryRoot, runCli } =
  useCliFixtures(nitpickerCli);

function isolatedCache() {
  return { NITPICKER_CACHE_DIR: makeTemporaryRoot('nitpicker-cli-cache-') };
}

function fixOrderObserver() {
  const operations = [];
  const operationsAtInvocations = [];
  const analyzer = fakeAnalyzer();
  return {
    operationsAtInvocations,
    analyzer: {
      ...analyzer,
      createInvocation: (settings) => {
        operationsAtInvocations.push([...operations]);
        return analyzer.createInvocation(settings);
      },
    },
    executeFixCommand: ({ operation }) => {
      operations.push(operation);
    },
  };
}

describe('nitpicker CLI', () => {
  it('fixes changed ESLint and Prettier violations before comparing without touching unchanged files or the index', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/changed.ts': 'export const changed = 1;\n',
      'src/main/format.mjs': 'export const format = 1;\n',
      'src/main/unchanged.ts': 'export let unchanged = 1;\n',
      'tests/placeholder.ts': 'export const placeholder = true;\n',
    });
    symlinkSync(
      path.join(fileURLToPath(new URL('../', import.meta.url)), '../node_modules'),
      path.join(repository.root, 'node_modules'),
      'dir',
    );
    writeFiles(repository.root, {
      'src/main/changed.ts': 'export let changed=2;\n',
    });
    fixtureGit(repository.root, ['add', 'src/main/changed.ts']);
    writeFiles(repository.root, {
      'src/main/changed.ts': 'export let changed=3;\n',
      'src/main/format.mjs': 'export const format=2\n',
    });
    const indexBefore = fixtureGit(repository.root, ['ls-files', '--stage']);
    const output = captureOutput();
    const outputRoot = makeOutputRoot();
    const observer = fixOrderObserver();
    const exitCode = runCli({
      arguments_: ['--fix', '--base', repository.baseRef, '--output', outputRoot],
      currentProjectRoot: repository.root,
      environment: isolatedCache(),
      analyzers: [observer.analyzer],
      executeFixCommand: observer.executeFixCommand,
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
      'export let unchanged = 1;\n',
    );
    expect(fixtureGit(repository.root, ['ls-files', '--stage'])).toBe(indexBefore);
    expect(output.stdoutText).toBe(`Fixed files:
src/main/changed.ts
src/main/format.mjs
Base: ${repository.baseRef} (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2mFull diagnostics: ${outputRoot}/report.txt\u001b[0m
`);
    expect(output.stderrText).toBe('');
    const fixOrder = ['eslint-fix', 'prettier-base-check', 'prettier-fix'];
    expect(observer.operationsAtInvocations).toEqual([fixOrder, fixOrder]);
  });
  it('continues remaining fixers and comparison when a fixer fails', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/changed.ts': 'export const changed = 1;\n',
      'src/main/format.mjs': 'export const format = 1;\n',
      'tests/placeholder.ts': 'export const placeholder = true;\n',
    });
    symlinkSync(
      path.join(fileURLToPath(new URL('../', import.meta.url)), '../node_modules'),
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
      environment: isolatedCache(),
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
    expect(output.stdoutText).toEqual(`Fixed files:
src/main/changed.ts
src/main/format.mjs
Base: ${repository.baseRef} (argument)

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
No new enforceable violations, but the run is incomplete:
\u001b[1m\u001b[31m✖ 1 tool error\u001b[0m
  \u001b[33meslint-fix (fix)\u001b[0m: eslint-fix failed: fixture ESLint failure
\u001b[2mFull diagnostics: ${outputRoot}/report.txt\u001b[0m
`);
    expect(output.stderrText).toBe('');
    expect(JSON.parse(readFileSync(path.join(outputRoot, 'summary.json'), 'utf8'))).toEqual({
      requestedBaseRef: repository.baseRef,
      resolvedBaseSha: repository.baseSha,
      mergeBaseSha: repository.baseSha,
      headSha: expect.stringMatching(exactText`${/[a-f0-9]{40}/}`),
      policyHash: expect.stringMatching(exactText`${/[a-f0-9]{64}/}`),
      configOverrides: [],
      tools: [
        {
          name: 'fake-quality-analyzer',
          version: '1.0.0',
          configurationHash: 'fixture-policy',
          base: 0,
          head: 0,
          new: 0,
          resolved: 0,
          unchanged: 0,
          changedMetrics: 0,
          baseElapsedMs: expect.any(Number),
          headElapsedMs: expect.any(Number),
          elapsedMs: expect.any(Number),
        },
      ],
      exclusions: [],
      renamedPaths: 0,
      elapsedMs: expect.any(Number),
      overallStatus: 'tool-error',
      newEnforceableFindings: 0,
      policyChanges: [],
      policyLoosenings: [],
      policyChangeAccepted: false,
      notices: [],
    });
    expect(JSON.parse(readFileSync(path.join(outputRoot, 'tool-errors.json'), 'utf8'))).toEqual([
      {
        tool: 'eslint-fix',
        snapshot: 'fix',
        message: 'eslint-fix failed: fixture ESLint failure',
      },
    ]);
  });
  it('uses a renamed file base path for Prettier fix eligibility', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/legacy.json':
        '[\n{"legacy":true},\n{"legacy":true},\n{"legacy":true},\n{"legacy":true}\n]\n',
    });
    fixtureGit(repository.root, ['mv', 'src/main/legacy.json', 'src/main/legacy.md']);
    writeFiles(repository.root, {
      'src/main/legacy.md':
        '[\n{"legacy":true},\n{"legacy":true},\n{"legacy":true},\n{"legacy":true}\n]\n\n#  Heading\n\nSome   text\n',
    });
    const output = captureOutput();
    let checkedBasePath;
    const exitCode = runCli({
      arguments_: ['--fix', '--base', repository.baseRef, '--output', makeOutputRoot()],
      currentProjectRoot: repository.root,
      environment: isolatedCache(),
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
    expect(output.stdoutText).toEqual(
      expect.stringMatching(exactText`Fixed files:
(none)
Base: ${repository.baseRef} (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`),
    );
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
      environment: isolatedCache(),
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
      path.join(fileURLToPath(new URL('../', import.meta.url)), '../node_modules'),
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
      environment: isolatedCache(),
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
  it('hands eslint --fix the ESLint project config the project opted into', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'nitpicker.config.json': `${JSON.stringify({
        tools: { eslint: { precedence: ['nitpicker', 'project'] } },
      })}\n`,
      'eslint.config.mjs': "export default [{ rules: { 'object-shorthand': 'error' } }];\n",
      'src/main/changed.ts': 'export const changed = 1;\n',
      'tests/placeholder.ts': 'export const placeholder = true;\n',
    });
    writeFiles(repository.root, {
      'src/main/changed.ts': 'const changed = 1;\nexport const holder = { changed: changed };\n',
    });
    const layers = [];
    const output = captureOutput();
    const exitCode = runCli({
      arguments_: ['--fix', '--base', repository.baseRef, '--output', makeOutputRoot()],
      currentProjectRoot: repository.root,
      environment: isolatedCache(),
      analyzers: [fakeAnalyzer()],
      executeFixCommand({ operation, environment }) {
        if (operation !== 'eslint-fix') {
          return undefined;
        }
        layers.push(JSON.parse(environment[PROJECT_LAYER_VARIABLE]));
        return { status: 0, stdout: '', stderr: '' };
      },
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode, output.stdoutText + output.stderrText).toBe(0);
    expect(layers).toEqual([
      {
        config: path.join(repository.root, 'eslint.config.mjs'),
        nitpickerFirst: true,
        addsRules: true,
      },
    ]);
  });
  it('rejects --fix combined with --all', () => {
    const output = captureOutput();
    expect(
      runCli({ arguments_: ['--fix', '--all'], stdout: output.stdout, stderr: output.stderr }),
    ).toBe(2);
    expect(output.stderrText).toEqual('nitpicker failed: --fix cannot be combined with --all\n');
  });
  it('rejects --all combined with --base', () => {
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--all', '--base', 'x'],
      environment: isolatedCache(),
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
