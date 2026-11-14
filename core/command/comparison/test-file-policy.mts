import { configureAll, presetAnalyzers } from '../../configuration/preset-analyzers.mts';
import { resolveProjectHeadPolicy } from '../../conventions/project-head-policy.mjs';
import { requestedAnalyzers } from './analyzers.mts';
import { withProjectTestFiles } from '../../../languages/typescript/preset/test-runner/test-files/project-test-files.mjs';
import type { Analyzer, ProfiledAnalyzer } from '../../../shared/values/analyzers.mts';
import type { NitpickerConfig } from '../../configuration/config-types.mts';
import type { ConfiguredCli } from './run-context.mts';

type ConfiguredProject = {
  readonly config: NitpickerConfig;
  readonly currentProjectRoot: string;
};

type TestFilePolicy = {
  readonly presetSet: readonly Analyzer[];
  readonly headPolicy: unknown;
  readonly analyzers: readonly ProfiledAnalyzer[];
};

export function configuredWithTestFiles(
  cli: ConfiguredCli,
  { config, currentProjectRoot }: ConfiguredProject,
): TestFilePolicy {
  const { options } = cli;
  const presetSet = presetAnalyzers(config, options.all ? cli.snapshotAnalyzers : cli.analyzers);
  const detectedPolicy: unknown = resolveProjectHeadPolicy(config, currentProjectRoot, {
    maven: cli.environment['NITPICKER_MAVEN'],
  });
  const headPolicy: unknown = withProjectTestFiles(detectedPolicy, {
    projectRoot: currentProjectRoot,
    liveProjectRoot: currentProjectRoot,
    analyzers: requestedAnalyzers(options, configureAll(presetSet, config, detectedPolicy)),
  });
  return { presetSet, headPolicy, analyzers: configureAll(presetSet, config, headPolicy) };
}
