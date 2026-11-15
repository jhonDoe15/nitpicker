import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { CliInput } from '../../cli-context.mts';
import type {
  PresetFixtureSettings,
  PresetFixtures,
  PresetRun,
  PresetRunOptions,
} from './fixture-types.mts';
import { parseJson } from '../../../shared/values/readers.mts';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mts';
import { withoutHelpUris } from '../../diff/reporting/test-support/report-reading.mts';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mts';

const COMPARISON_BASE_REF = 'comparison-base';

export function usePresetFixtures({
  runCli,
  name,
  templateFiles,
  prepareRepository,
  runOptions = {},
}: PresetFixtureSettings): PresetFixtures {
  const git = useGitFixtures();

  function repository(files?: Readonly<Record<string, string>>) {
    const { root } = git.createGitRepository(
      { ...templateFiles, ...files },
      { prefix: `nitpicker-${name}-cli-`, baseRef: COMPARISON_BASE_REF },
    );
    prepareRepository?.(root);
    return root;
  }

  function invokeCli(options: CliInput) {
    return runCli({ ...runOptions, ...options });
  }

  function run(
    root: string,
    extra: readonly string[] = [],
    { subprocess, interactive }: PresetRunOptions = {},
  ): PresetRun {
    const output = captureOutput();
    const reports = path.join(git.temporaryRoot(`nitpicker-${name}-out-`), 'reports');
    const exitCode = invokeCli({
      arguments_: ['--base', COMPARISON_BASE_REF, '--output', reports, ...extra],
      environment: { NO_COLOR: '1' },
      currentProjectRoot: root,
      stdout: output.stdout,
      stderr: output.stderr,
      progress: { write: () => undefined },
      interactive: interactive === true,
      ...(subprocess === true ? { runTasks: undefined } : {}),
    });
    return {
      exitCode,
      reports,
      json: (reportName: string) =>
        withoutHelpUris(parseJson(readFileSync(path.join(reports, reportName), 'utf8'))),
      output: { out: output.stdoutText, err: output.stderrText },
      text: output.stdoutText + output.stderrText,
    };
  }

  return { temporaryRoot: git.temporaryRoot, repository, run, runCli: invokeCli };
}
