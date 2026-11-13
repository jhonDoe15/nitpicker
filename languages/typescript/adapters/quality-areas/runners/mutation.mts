import { runScopedMutation } from '../test-weakening/scoped-mutation.mts';
import { configuredTargets, MUTATION_REPORT_PATH } from './mutation-scope.mts';
import {
  type CreatedFiles,
  STRYKER_CONFIG_PATH,
  createdFilesTracker,
  installMutationCompanion,
  installStrykerTsconfig,
  mutatePatterns,
  optionalText,
  rebaseMutationConfig,
  strykerRunConfig,
  writeTemporaryFile,
} from './stryker/stryker-config.mts';
import { readHeadPolicy, readLayout } from '../../typed/head-policy.mts';
import { fieldOf, fieldsOf, parseJson } from '../../../../../shared/values/readers.mts';
import { importPolicyModule, relativeProjectPath, runNodeTool } from '../typed/tooling.mts';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import type { Finding } from '../../static-checks/shared.mts';
import type { QualityAreaOptions } from '../typed/area-types.mts';
import { toolErrorFinding } from '../typed/reporting.mts';
import { mutationSkipFor } from './skips/mutation-skips.mts';
import { CRACO_JEST_CONFIG } from '../../test-runners/mutation-runner-config.mjs';
import {
  mutationCheckerConfig,
  mutationCheckerEngine,
} from '../../mutation-checker/native-checker.mts';
import {
  type MutationOutcome,
  type MutationReport,
  type RunnerCommand,
  type StrykerConfig,
  type TestRunner,
  cracoJestConfigText,
  layeredStrykerConfig,
  mutationRunnerConfig,
  normalizeMutation,
  projectTestRunner,
  runnableTestFiles,
  unsupportedMutationRunner,
  withMutationSourceHashes,
  withoutProjectIgnoredMutants,
  withUnreachedMutantsUncovered,
} from '../typed/mutation.mts';

type StrykerRun = {
  readonly options: QualityAreaOptions;
  readonly sourceConfig: StrykerConfig;
  readonly targets: readonly string[] | undefined;
  readonly createdFiles: CreatedFiles;
  readonly testRunner: TestRunner;
};

const UNSUPPORTED_RUNNER_RULE = 'mutation-unsupported-runner';

export function runMutation(options: QualityAreaOptions): Promise<Finding[]> {
  return runScopedMutation(options, {
    layout: readLayout(),
    exceptions: readHeadPolicy().exceptions,
    mutationReport,
    normalize: normalizeMutation,
  });
}

async function mutationReport(
  options: QualityAreaOptions,
  targets: readonly string[] | undefined,
): Promise<MutationOutcome> {
  const testRunner = projectTestRunner(options);
  const unsupported = unsupportedMutationRunner(options, testRunner.runner);
  if (unsupported !== undefined) {
    return {
      skipped: [
        toolErrorFinding(options, {
          rule: UNSUPPORTED_RUNNER_RULE,
          message: unsupported,
          anchor: undefined,
        }),
      ],
    };
  }
  const loaded = await importPolicyModule(
    options,
    STRYKER_CONFIG_PATH,
    `?run=${Date.now().toString()}`,
  );
  const sourceConfig = fieldsOf(fieldOf(loaded, 'default'));
  return targets !== undefined &&
    configuredTargets(targets, mutatePatterns(sourceConfig)).length === 0
    ? { report: { files: {} } }
    : strykerReport(options, { sourceConfig, targets, testRunner });
}

async function strykerReport(
  options: QualityAreaOptions,
  { sourceConfig, targets, testRunner }: Omit<StrykerRun, 'options' | 'createdFiles'>,
): Promise<MutationOutcome> {
  const configPath = path.join(options.projectRoot, '.nitpicker-diff-stryker.config.mjs');
  const createdFiles = createdFilesTracker();
  try {
    const written = await writeStrykerConfig({
      options,
      sourceConfig,
      targets,
      configPath,
      createdFiles,
      testRunner,
    });
    const skippedFindings = runStrykerOrExplainSkip(options, configPath, written.command);
    if (skippedFindings !== undefined) {
      return { skipped: skippedFindings };
    }
    return {
      report: withMutationSourceHashes(
        withoutProjectIgnoredMutants(
          readMutationReport(options.projectRoot, fieldOf(written.config, 'coverageAnalysis')),
          written.config,
        ),
        options.projectRoot,
      ),
    };
  } finally {
    await Promise.all(createdFiles.paths().map((filePath) => rm(filePath, { force: true })));
  }
}

async function runnerConfig({
  options,
  sourceConfig,
  targets,
  createdFiles,
  testRunner,
}: StrykerRun): Promise<StrykerConfig> {
  const { tsconfigPath, baselineErrors, native } = await installStrykerTsconfig(options, {
    sourceRelativePath: optionalText(fieldOf(sourceConfig, 'tsconfigFile')),
    createdFiles,
    engine: mutationCheckerEngine(targets),
  });
  function withChecker(config: StrykerConfig): StrykerConfig {
    return mutationCheckerConfig(config, { baselineErrors, native });
  }
  const tsconfigFile = relativeProjectPath(options.projectRoot, tsconfigPath);
  if (testRunner.command.launcher === 'craco') {
    const cracoConfigPath = path.join(options.projectRoot, CRACO_JEST_CONFIG);
    writeTemporaryFile(cracoConfigPath, cracoJestConfigText(), createdFiles);
  }
  if (testRunner.runner !== 'vitest') {
    return withChecker(
      mutationRunnerConfig({
        options,
        runner: testRunner.runner,
        command: testRunner.command,
        testFiles: runnableTestFiles(options),
        sourceConfig: { ...sourceConfig, tsconfigFile },
      }),
    );
  }
  const vitestConfigPath = installMutationCompanion(
    options,
    [
      optionalText(fieldOf(fieldOf(sourceConfig, 'vitest'), 'configFile')),
      '.nitpicker-diff-stryker.vitest.config.ts',
    ],
    createdFiles,
  );
  return withChecker(
    rebaseMutationConfig(sourceConfig, {
      tsconfigFile,
      vitestConfigFile: relativeProjectPath(options.projectRoot, vitestConfigPath),
    }),
  );
}

async function writeStrykerConfig({
  options,
  sourceConfig,
  targets,
  configPath,
  createdFiles,
  testRunner,
}: StrykerRun & { readonly configPath: string }): Promise<{
  readonly command: RunnerCommand;
  readonly config: StrykerConfig;
}> {
  const config = strykerRunConfig(
    layeredStrykerConfig(
      await runnerConfig({ options, sourceConfig, targets, createdFiles, testRunner }),
    ),
    { snapshot: options.snapshot, targets },
  );
  writeTemporaryFile(
    configPath,
    `export default ${JSON.stringify(config, null, 2)};\n`,
    createdFiles,
  );
  return { command: testRunner.command, config };
}

function runStrykerOrExplainSkip(
  options: QualityAreaOptions,
  configPath: string,
  command: RunnerCommand,
): Finding[] | undefined {
  try {
    runNodeTool({
      options,
      relativeToolPath: '@stryker-mutator/core/bin/stryker.js',
      arguments_: ['run', configPath],
      environment: command.environment,
      acceptedStatuses: [0],
    });
    return undefined;
  } catch (error) {
    const skip =
      error instanceof Error ? mutationSkipFor(error.message, options.snapshot) : undefined;
    if (skip === undefined) {
      throw error;
    }
    return [toolErrorFinding(options, skip)];
  }
}

function readMutationReport(projectRoot: string, coverageAnalysis: unknown): MutationReport {
  return withUnreachedMutantsUncovered(
    parseJson(readFileSync(path.join(projectRoot, MUTATION_REPORT_PATH), 'utf8')),
    coverageAnalysis,
  );
}
