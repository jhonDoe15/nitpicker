import { policyAcceptance } from '../policy-review/policy-acceptance.mts';
import { javascriptPresetHint } from '../../configuration/project-checks/preset-detection.mjs';
import { resolveCacheStore } from '../../diff/cache/cache-stores.mjs';
import { fieldsOf, textOf, textsOf } from '../../../shared/values/readers.mts';
import type { Analyzer } from '../../../shared/values/analyzers.mts';
import type { Cli, CliOptions, RunSetup, TextOutput } from '../../cli-context.mts';
import type { NitpickerConfig } from '../../configuration/config-types.mts';

export type ConfiguredCli = Cli & {
  readonly options: CliOptions;
  readonly jsonOutput?: TextOutput;
};

export type ComparisonCli = Omit<ConfiguredCli, 'analyzers' | 'currentProjectRoot'> &
  RunSetup & {
    readonly currentProjectRoot: string;
    readonly injectedAnalyzers: readonly Analyzer[] | undefined;
    readonly config: NitpickerConfig;
    readonly headPolicy: unknown;
    readonly scope: unknown;
  };

export function writePresetHint(
  stderr: TextOutput,
  config: NitpickerConfig,
  projectRoot: string,
): void {
  const hint = javascriptPresetHint(config, projectRoot);
  if (hint !== undefined) {
    stderr.write(`nitpicker: ${hint}\n`);
  }
}

export function writeNotes(stderr: TextOutput, notes: unknown): void {
  for (const note of textsOf(notes)) {
    stderr.write(`nitpicker: ${note}\n`);
  }
}

export function acceptanceOf(
  cli: Pick<ConfiguredCli, 'options' | 'environment' | 'interactive' | 'stderr'>,
): object {
  const { ignoredAcceptance, ...acceptance } = fieldsOf(
    policyAcceptance(cli.options, cli.environment, cli.interactive),
  );
  if (ignoredAcceptance !== undefined) {
    cli.stderr.write(`nitpicker: ${textOf(ignoredAcceptance)}\n`);
  }
  return acceptance;
}

export function resolveRunCacheStore(
  cli: Pick<ComparisonCli, 'currentProjectRoot' | 'environment' | 'options' | 'stderr'>,
): unknown {
  const { store, warnings } = resolveCacheStore({
    projectRoot: cli.currentProjectRoot,
    environment: cli.environment,
  });
  if (cli.options.cache) {
    writeNotes(cli.stderr, warnings);
  }
  return cli.options.cache ? store : undefined;
}
