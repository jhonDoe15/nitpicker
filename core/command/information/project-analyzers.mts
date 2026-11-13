import { describeError } from '../../../shared/messages/error-chain.mjs';
import { applyDisable, loadConfig } from '../../configuration/config.mjs';
import { presetAnalyzers } from '../../configuration/preset-analyzers.mts';
import { resolveRunTarget } from '../../scope/run-target.mjs';
import { missingPathHint } from '../arguments.mts';
import { analyzersOf } from '../../../shared/values/analyzers.mts';
import { textOf } from '../../../shared/values/readers.mts';
import type { CliOptions } from '../../cli-context.mts';
import type { NitpickerConfig } from '../../configuration/config-types.mts';

export type InformationCli = {
  readonly options: Pick<CliOptions, 'paths'>;
  readonly currentProjectRoot?: string | undefined;
  readonly workingDirectory?: string | undefined;
};

type ProjectAnalyzers =
  { readonly preset: string; readonly names: readonly string[] } | { readonly error: string };

function analyzerNames(config: NitpickerConfig): string[] {
  const builtIn = analyzersOf(applyDisable(presetAnalyzers(config), config)).map(
    ({ name }) => name,
  );
  return [...builtIn, ...(config.analyzers ?? []).map(({ name }) => name)];
}

export function projectAnalyzers(cli: InformationCli): ProjectAnalyzers {
  try {
    const target = resolveRunTarget({
      ...cli,
      currentProjectRoot: cli.currentProjectRoot,
      workingDirectory: cli.workingDirectory,
      missingPathHint,
    });
    const config: NitpickerConfig = loadConfig(textOf(target.currentProjectRoot));
    return { preset: config.preset ?? 'typescript', names: analyzerNames(config) };
  } catch (error) {
    return { error: textOf(describeError(error)) };
  }
}
