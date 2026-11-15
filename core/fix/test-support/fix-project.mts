import { readFileSync } from 'node:fs';
import { runCli as nitpickerCli } from '../../cli.mts';
import { fakeAnalyzer, useCliFixtures } from '../../command/test-support/cli-harness.mts';
import { policy } from '../../diff/execution/test-support/analyzer-findings.mts';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mts';
import { fixtureGit } from '../../diff/git/test-support/git-repository.mts';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mts';
import { containedPath } from '../common/contained-path.mjs';
import type { ExitCode } from '../../cli-context.mts';
import { parseJson } from '../../../shared/values/readers.mts';

type FixRun = {
  readonly committed: Readonly<Record<string, string>>;
  readonly changed: Readonly<Record<string, string>>;
  readonly cliArguments?: readonly string[];
  readonly prepare?: ((root: string) => void) | undefined;
  readonly realAnalyzers?: true | undefined;
};

type FixResult = {
  readonly exitCode: ExitCode;
  readonly stdout: string;
  readonly stderr: string;
  readonly read: (name: string) => string;
  readonly baseSource: (name: string) => string;
  readonly newFindings: () => unknown;
  readonly toolErrors: () => unknown;
};

function readReport(outputRoot: string, name: string): unknown {
  return parseJson(readFileSync(containedPath(outputRoot, name), 'utf8'));
}

export function useFixProject(): { readonly fix: (run: FixRun) => FixResult } {
  const { createRepository, makeOutputRoot, runCli } = useCliFixtures(nitpickerCli);

  function fix({
    committed,
    changed,
    cliArguments = ['--fix', '--no-cache'],
    prepare,
    realAnalyzers,
  }: FixRun): FixResult {
    const repository = createRepository({ 'quality-policy.json': policy(), ...committed });
    prepare?.(repository.root);
    writeFiles(repository.root, changed);
    const output = captureOutput();
    const outputRoot = makeOutputRoot();
    const exitCode = runCli({
      arguments_: [...cliArguments, '--base', repository.baseRef, '--output', outputRoot],
      currentProjectRoot: repository.root,
      ...(realAnalyzers === true ? {} : { analyzers: [fakeAnalyzer()] }),
      stdout: output.stdout,
      stderr: output.stderr,
    });
    return {
      exitCode,
      stdout: output.stdoutText,
      stderr: output.stderrText,
      read: (name: string) => readFileSync(containedPath(repository.root, name), 'utf8'),
      baseSource: (name: string) =>
        fixtureGit(repository.root, ['show', `${repository.baseRef}:${name}`]),
      newFindings: () => readReport(outputRoot, 'new-findings.json'),
      toolErrors: () => readReport(outputRoot, 'tool-errors.json'),
    };
  }

  return { fix };
}

export function fixReport(stdout: string): string {
  const start = stdout.indexOf('Fixed files:');
  return stdout.slice(start, stdout.indexOf('Base: ', start));
}
