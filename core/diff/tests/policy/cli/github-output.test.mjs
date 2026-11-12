import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../../../cli.mjs';
import { useCliFixtures, fakeAnalyzer } from '../../../../command/test-support/cli-harness.mjs';
import {
  finding,
  findingLine,
  policy,
} from '../../../execution/test-support/analyzer-findings.mjs';
import { writeFiles } from '../../../git/test-support/fixture-files.mjs';
import { commit, fixtureGit } from '../../../git/test-support/git-repository.mjs';
import { captureOutput } from '../../../reporting/test-support/output-capture.mjs';

const { createRepository, makeOutputRoot, makeTemporaryRoot, runCli } =
  useCliFixtures(nitpickerCli);

const ANNOTATION =
  '::error file=src/main/new.ts,line=1,col=4,title=fake-quality-analyzer/fixture-rule::Fixture: 100%25';

function repositoryWithNewFinding() {
  const repository = createRepository({
    'quality-policy.json': policy(),
    'src/main/stable.ts': 'export const stable = true;\n',
  });
  writeFiles(repository.root, {
    'src/main/new.ts': findingLine(finding({ identity: 'introduced', message: 'Fixture: 100%' })),
  });
  commit(repository.root, 'introduce finding');
  return repository;
}

function githubEnvironment() {
  const summaryPath = path.join(makeTemporaryRoot('nitpicker-github-summary-'), 'summary.md');
  writeFileSync(summaryPath, '');
  return {
    summaryPath,
    environment: { GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: summaryPath },
  };
}

function annotationsOf(output) {
  return output.stdoutText.split('\n').filter((line) => line.startsWith('::'));
}

function summaryLines(summaryPath) {
  return readFileSync(summaryPath, 'utf8').split('\n');
}

describe('GitHub Actions output of the command line', () => {
  it('writes annotations and the job summary for a comparison and still exits 1', () => {
    const repository = repositoryWithNewFinding();
    const { summaryPath, environment } = githubEnvironment();
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--base', repository.baseRef, '--output', makeOutputRoot()],
      environment,
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    const headSha = fixtureGit(repository.root, ['rev-parse', 'HEAD']).trim().slice(0, 12);

    expect(exitCode).toBe(1);
    expect(annotationsOf(output)).toEqual([ANNOTATION]);
    expect(summaryLines(summaryPath).slice(0, 15)).toEqual([
      '## nitpicker',
      '',
      '**✖ 1 new enforceable finding**',
      '',
      `Base \`${repository.baseRef}\` (merge base \`${repository.baseSha.slice(0, 12)}\`), head \`${headSha}\`.`,
      '1 new finding, 0 resolved, 0 changed metrics.',
      '',
      '### New findings by tool and rule',
      '',
      '| Tool | Rule | Enforceable | Descriptive |',
      '| --- | --- | ---: | ---: |',
      '| `fake-quality-analyzer` | `fixture-rule` | 1 | 0 |',
      '',
      '### New enforceable findings',
      '',
    ]);
    expect(summaryLines(summaryPath)[15]).toBe(
      '- `src/main/new.ts:1` `fake-quality-analyzer/fixture-rule`: Fixture: 100%',
    );
  });

  it('writes nothing extra outside GitHub Actions', () => {
    const repository = repositoryWithNewFinding();
    const output = captureOutput();

    runCli({
      arguments_: ['--base', repository.baseRef, '--output', makeOutputRoot()],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(annotationsOf(output)).toEqual([]);
  });

  it('leaves a shard worker silent, since its report is partial', () => {
    const repository = repositoryWithNewFinding();
    const { summaryPath, environment } = githubEnvironment();
    const output = captureOutput();

    runCli({
      arguments_: [
        '--base',
        repository.baseRef,
        '--output',
        makeOutputRoot(),
        '--shard-count',
        '1',
        '--shard-index',
        '0',
        '--defer-exit',
      ],
      environment,
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(annotationsOf(output)).toEqual([]);
    expect(readFileSync(summaryPath, 'utf8')).toBe('');
  });

  it('reports a full run with --all', () => {
    const repository = repositoryWithNewFinding();
    const { summaryPath, environment } = githubEnvironment();
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--all', '--output', makeOutputRoot()],
      environment,
      currentProjectRoot: repository.root,
      snapshotAnalyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(1);
    expect(annotationsOf(output)).toEqual([ANNOTATION]);
    expect(summaryLines(summaryPath).slice(0, 5)).toEqual([
      '## nitpicker full run',
      '',
      '**✖ 1 enforceable finding in the checkout**',
      '',
      '1 finding in all, 0 descriptive.',
    ]);
  });
});
