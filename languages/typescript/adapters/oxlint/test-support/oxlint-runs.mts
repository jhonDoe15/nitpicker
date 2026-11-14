import type { LintEngineOptions, RunEslintCli } from '../../lint-engine/typed/tools.mts';
import { parseJson, textOf } from '../../../../../shared/values/readers.mts';

export type LintProjectRequest = {
  readonly root: string;
  readonly patterns: readonly string[];
  readonly projectConfigName?: string;
  readonly runEslintCli?: RunEslintCli;
};

export function oxlintOptions(root: string, patterns: readonly string[]): LintEngineOptions {
  return {
    projectRoot: root,
    liveProjectRoot: root,
    configRelativePath: 'eslint.config.mjs',
    patterns,
    timeoutMs: undefined,
    environment: {},
  };
}

export type ResidualRun = { readonly files: readonly string[]; readonly rules: unknown };

export function residualRecorder(): {
  readonly runs: ResidualRun[];
  readonly runEslintCli: RunEslintCli;
} {
  const runs: ResidualRun[] = [];
  return {
    runs,
    runEslintCli(files, environment) {
      runs.push({
        files,
        rules: parseJson(textOf(environment?.['NITPICKER_DIFF_ESLINT_ONLY_RULES'])),
      });
      return Promise.resolve([]);
    },
  };
}
