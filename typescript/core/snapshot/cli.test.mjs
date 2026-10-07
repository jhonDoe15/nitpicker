import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseArguments, runCli } from './cli.mjs';
import { REPORT_FILE_NAMES } from './reporters.mjs';

const fakeAnalyzerPath = path.join(import.meta.dirname, '../diff/fixtures/fake-analyzer.mjs');
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('snapshot CLI', () => {
  it('exits zero and reports clean when nothing enforceable is found', () => {
    const projectRoot = createFixtureRoot({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
    });
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--output', 'reports/quality/snapshot'],
      currentProjectRoot: projectRoot,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toContain('Status: clean');
    for (const reportFileName of REPORT_FILE_NAMES) {
      expect(existsSync(path.join(projectRoot, 'reports/quality/snapshot', reportFileName))).toBe(
        true,
      );
    }
  });

  it('exits nonzero when any enforceable finding exists right now, with no upstream comparison', () => {
    const projectRoot = createFixtureRoot({
      'quality-policy.json': policy(),
      'src/main/existing.ts': findingLine(finding({ identity: 'long-standing-debt' })),
    });
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--output', 'reports/quality/snapshot'],
      currentProjectRoot: projectRoot,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(1);
    expect(output.stdoutText).toContain('Status: violations');
    expect(output.stdoutText).toContain('Enforceable findings: 1');
  });

  it('exits 2 and does not write reports when an analyzer crashes', () => {
    const projectRoot = createFixtureRoot({ 'quality-policy.json': policy({ mode: 'crash' }) });
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: [],
      currentProjectRoot: projectRoot,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(2);
    expect(output.stdoutText).toContain('Status: tool-error');
  });

  it('restricts the run to a named analyzer with --analyzer', () => {
    const projectRoot = createFixtureRoot({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
    });
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--analyzer', 'fake-quality-analyzer'],
      currentProjectRoot: projectRoot,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toContain('fake-quality-analyzer:');
  });

  it('rejects an unknown --analyzer name', () => {
    const projectRoot = createFixtureRoot({ 'quality-policy.json': policy() });
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--analyzer', 'does-not-exist'],
      currentProjectRoot: projectRoot,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(2);
    expect(output.stderrText).toContain('Unknown --analyzer: does-not-exist');
  });

  it('prints a drill-down section for findings matching --rule', () => {
    const projectRoot = createFixtureRoot({
      'quality-policy.json': policy(),
      'src/main/existing.ts': findingLine(finding({ identity: 'debt', rule: 'match-me' })),
    });
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--rule', 'match-me'],
      currentProjectRoot: projectRoot,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(1);
    expect(output.stdoutText).toContain('Findings matching --rule match-me:');
    expect(output.stdoutText).toContain('fake-quality-analyzer/match-me');
  });

  it('prints usage for --help without running any analyzer', () => {
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--help'],
      currentProjectRoot: createFixtureRoot({}),
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toContain('Usage: nitpicker snapshot');
  });
});

describe('snapshot argument parsing', () => {
  it('collects repeatable --analyzer and --rule flags', () => {
    expect(
      parseArguments(['--analyzer', 'eslint-lint', '--analyzer', 'entry-points', '--rule', 'x']),
    ).toEqual({
      kind: 'run',
      analyzerNames: ['eslint-lint', 'entry-points'],
      ruleFilters: ['x'],
      outputRoot: undefined,
    });
  });

  it('rejects an unknown argument', () => {
    expect(() => parseArguments(['--bogus'])).toThrow(/Unknown argument: --bogus/);
  });

  it('requires a value for --analyzer, --rule, and --output', () => {
    expect(() => parseArguments(['--analyzer'])).toThrow(/--analyzer requires a value/);
    expect(() => parseArguments(['--rule'])).toThrow(/--rule requires a value/);
    expect(() => parseArguments(['--output'])).toThrow(/--output requires a value/);
  });
});

function createFixtureRoot(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'quality-snapshot-cli-fixture-'));
  temporaryRoots.push(root);
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
  return root;
}

function fakeAnalyzer(overrides = {}) {
  return {
    name: 'fake-quality-analyzer',
    version: '1.0.0',
    configurationHash: 'fixture-policy',
    exclusions: [],
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
    ...overrides,
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

function findingLine(value, marker = 'QUALITY_FINDING') {
  return `// ${marker} ${JSON.stringify(value)}\n`;
}

function policy(overrides = {}) {
  return `${JSON.stringify({ marker: 'QUALITY_FINDING', ...overrides }, null, 2)}\n`;
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
