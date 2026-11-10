import { readFileSync } from 'node:fs';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { fakeAnalyzer, useCliFixtures } from '../../command/test-support/cli-harness.mjs';
import { policy } from '../../diff/execution/test-support/analyzer-findings.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { fixtureGit } from '../../diff/git/test-support/git-repository.mjs';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import { containedPath } from '../common/contained-path.mjs';

function readReport(outputRoot, name) {
  return JSON.parse(readFileSync(containedPath(outputRoot, name), 'utf8'));
}

export function useFixProject() {
  const { createRepository, makeOutputRoot, runCli } = useCliFixtures(nitpickerCli);

  function fix({
    committed,
    changed,
    cliArguments = ['--fix', '--no-cache'],
    prepare,
    realAnalyzers = false,
  }) {
    const repository = createRepository({ 'quality-policy.json': policy(), ...committed });
    prepare?.(repository.root);
    writeFiles(repository.root, changed);
    const output = captureOutput();
    const outputRoot = makeOutputRoot();
    const exitCode = runCli({
      arguments_: [...cliArguments, '--base', repository.baseRef, '--output', outputRoot],
      currentProjectRoot: repository.root,
      ...(realAnalyzers ? {} : { analyzers: [fakeAnalyzer()] }),
      stdout: output.stdout,
      stderr: output.stderr,
    });
    return {
      exitCode,
      stdout: output.stdoutText,
      stderr: output.stderrText,
      read: (name) => readFileSync(containedPath(repository.root, name), 'utf8'),
      baseSource: (name) => fixtureGit(repository.root, ['show', `${repository.baseRef}:${name}`]),
      newFindings: () => readReport(outputRoot, 'new-findings.json'),
      toolErrors: () => readReport(outputRoot, 'tool-errors.json'),
    };
  }

  return { fix };
}

export function fixReport(stdout) {
  const start = stdout.indexOf('Fixed files:');
  return stdout.slice(start, stdout.indexOf('Base: ', start));
}
