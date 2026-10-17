import { readFileSync } from 'node:fs';
import path from 'node:path';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';

const COMPARISON_BASE_REF = 'comparison-base';

export function usePresetFixtures({
  runCli,
  name,
  templateFiles,
  prepareRepository,
  runOptions = {},
}) {
  const git = useGitFixtures();

  function repository(files) {
    const { root } = git.createGitRepository(
      { ...templateFiles, ...files },
      { prefix: `nitpicker-${name}-cli-`, baseRef: COMPARISON_BASE_REF },
    );
    prepareRepository?.(root);
    return root;
  }

  function invokeCli(options) {
    return runCli({ ...runOptions, ...options });
  }

  function run(root, extra = [], { subprocess = false, interactive = false } = {}) {
    const output = captureOutput();
    const reports = path.join(git.temporaryRoot(`nitpicker-${name}-out-`), 'reports');
    const exitCode = invokeCli({
      arguments_: ['--base', COMPARISON_BASE_REF, '--output', reports, ...extra],
      environment: { NO_COLOR: '1' },
      currentProjectRoot: root,
      stdout: output.stdout,
      stderr: output.stderr,
      progress: { write: () => undefined },
      interactive,
      ...(subprocess ? { runTasks: undefined } : {}),
    });
    return {
      exitCode,
      reports,
      json: (reportName) => JSON.parse(readFileSync(path.join(reports, reportName), 'utf8')),
      output: { out: output.stdoutText, err: output.stderrText },
      text: output.stdoutText + output.stderrText,
    };
  }

  return { temporaryRoot: git.temporaryRoot, repository, run, runCli: invokeCli };
}
