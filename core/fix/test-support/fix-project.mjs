import { readFileSync } from 'node:fs';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { fakeAnalyzer, useCliFixtures } from '../../command/test-support/cli-harness.mjs';
import { policy } from '../../diff/execution/test-support/analyzer-findings.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { fixtureGit } from '../../diff/git/test-support/git-repository.mjs';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import { containedPath } from '../common/contained-path.mjs';

export function useFixProject() {
  const { createRepository, makeOutputRoot, runCli } = useCliFixtures(nitpickerCli);

  function fix({ committed, changed, cliArguments = ['--fix', '--no-cache'] }) {
    const repository = createRepository({ 'quality-policy.json': policy(), ...committed });
    writeFiles(repository.root, changed);
    const output = captureOutput();
    const exitCode = runCli({
      arguments_: [...cliArguments, '--base', repository.baseRef, '--output', makeOutputRoot()],
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });
    return {
      exitCode,
      stdout: output.stdoutText,
      stderr: output.stderrText,
      read: (name) => readFileSync(containedPath(repository.root, name), 'utf8'),
      baseSource: (name) => fixtureGit(repository.root, ['show', `${repository.baseRef}:${name}`]),
    };
  }

  return { fix };
}

export function fixReport(stdout) {
  const start = stdout.indexOf('Fixed files:');
  return stdout.slice(start, stdout.indexOf('Base: ', start));
}
