import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mts';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { EXECUTION_INPUTS, sourceInputs } from '../../../shared/input-sets/inputs.mjs';
import { crashingAnalyzer, fakeAnalyzer, useCliFixtures } from '../test-support/cli-harness.mjs';

const { createRepository, makeOutputRoot, runCli } = useCliFixtures(nitpickerCli);

const initialFiles = {
  'README.md': '# Fixture\n',
  'docs/usage.md': 'Usage\n',
  'src/main/clean.ts': 'export const clean = true;\n',
};

function runChange(changes, analyzers) {
  const repository = createRepository(initialFiles);
  writeFiles(repository.root, changes);
  const output = captureOutput();
  const outputRoot = makeOutputRoot();
  const exitCode = runCli({
    arguments_: ['--base', repository.baseRef, '--output', outputRoot],
    environment: {},
    currentProjectRoot: repository.root,
    analyzers,
    stdout: output.stdout,
    stderr: output.stderr,
  });
  const summary = JSON.parse(readFileSync(path.join(outputRoot, 'summary.json'), 'utf8'));
  return { exitCode, output, summary, repository, outputRoot };
}

const executionCrash = () => ({ ...crashingAnalyzer(), inputs: EXECUTION_INPUTS });
const sourceCrash = () => ({
  ...crashingAnalyzer(),
  name: 'source-crash',
  inputs: sourceInputs(['ts']),
});
const quiet = () => ({ ...fakeAnalyzer('quiet-analyzer'), inputs: sourceInputs(['ts']) });

describe('skipping analyzers a change cannot affect', () => {
  it('runs no analyzer for a documentation-only change, prints one line and exits 0', () => {
    const { exitCode, output, summary, repository } = runChange(
      { 'README.md': '# Fixture\n\nMore words.\n', 'docs/usage.md': 'Usage changed\n' },
      [executionCrash(), sourceCrash()],
    );

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toBe(
      `No analyzer reads the files changed since comparison-base (${repository.baseSha.slice(0, 12)}); skipped crashing-analyzer, source-crash.\n`,
    );
    expect(output.stderrText).toBe('');
    expect(summary.noChanges).toBeUndefined();
    expect(summary.skippedAll).toBe(true);
    expect(summary.skippedAnalyzers).toEqual(['crashing-analyzer', 'source-crash']);
    expect(summary.tools).toEqual([]);
  });

  it.each([
    'nitpicker.config.json',
    'package.json',
    'package-lock.json',
    'build.gradle',
    'pom.xml',
  ])('runs every analyzer for a change to %s', (file) => {
    const content = file === 'nitpicker.config.json' ? '{}\n' : '{"changed":true}\n';
    const { exitCode, summary } = runChange({ [file]: content }, [executionCrash(), sourceCrash()]);

    expect(exitCode).toBe(2);
    expect(summary.noChanges).toBeUndefined();
    expect(summary.skippedAnalyzers).toBeUndefined();
    expect(summary.tools.map(({ name }) => name)).toEqual(['crashing-analyzer', 'source-crash']);
  });

  it('runs only the analyzers whose inputs the change touches', () => {
    const { exitCode, output, summary, outputRoot } = runChange(
      { 'test/fixtures/rows.csv': 'a,b\n' },
      [executionCrash(), quiet()],
    );

    expect(exitCode).toBe(2);
    expect(summary.skippedAnalyzers).toEqual(['quiet-analyzer']);
    expect(summary.tools.map(({ name }) => name)).toEqual(['crashing-analyzer']);
    expect(output.stdoutText).toBe(
      [
        'Base: comparison-base (argument)',
        '',
        'Quality gate summary',
        'No new enforceable violations, but the run is incomplete:',
        '✖ 2 tool errors (1 distinct)',
        '  crashing-analyzer (base and head): crashing-analyzer crashed with exit 2: no diagnostic output. See https://github.com/jhonDoe15/nitpicker/blob/main/docs/troubleshooting.md#an-analyzer-crashes',
        'Skipped quiet-analyzer: no changed file is in their inputs.',
        `Full diagnostics: ${path.join(outputRoot, 'report.txt')}`,
        '',
      ].join('\n'),
    );
  });

  it('runs an analyzer that declares no inputs for a documentation change', () => {
    const { exitCode, summary } = runChange({ 'README.md': 'changed\n' }, [crashingAnalyzer()]);

    expect(exitCode).toBe(2);
    expect(summary.tools.map(({ name }) => name)).toEqual(['crashing-analyzer']);
  });
});
