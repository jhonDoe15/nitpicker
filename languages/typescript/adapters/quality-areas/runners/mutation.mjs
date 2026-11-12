import { runScopedMutation } from '../test-weakening/scoped-mutation.mjs';
import { configuredTargets, MUTATION_REPORT_PATH } from './mutation-scope.mjs';
import { readHeadPolicy, readLayout } from '../../../preset/head-policy.mjs';
import { importPolicyModule, relativeProjectPath, runNodeTool, policyFile } from './tooling.mjs';
import path from 'node:path';
import { normalizeMutation, withUnreachedMutantsUncovered } from '../reporting/tests.mjs';
import { withMutationSourceHashes } from '../reporting/source-hashes.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { toolErrorFinding } from '../reporting/test-report.mjs';
import { mutationSkipFor } from './skips/mutation-skips.mjs';
import { layoutTransformFor } from '../../../preset/tool-configs.mjs';
import { trackTemporaryPath } from '../../../../../core/tooling/temporary-files.mjs';
import { projectTestRunner } from '../../../preset/test-runner/project-runner.mjs';
import {
  CRACO_JEST_CONFIG,
  cracoJestConfigText,
  mutationRunnerConfig,
  unsupportedMutationRunner,
} from '../../test-runners/mutation-runner-config.mjs';
import { runnableTestFiles } from '../../test-runners/test-run.mjs';
import {
  layeredStrykerConfig,
  withoutProjectIgnoredMutants,
} from '../../../preset/project-configs/stryker-project-config.mjs';
import {
  mutationCheckerConfig,
  mutationCheckerEngine,
  mutationTypecheck,
} from '../../mutation-checker/native-checker.mjs';

const UNSUPPORTED_RUNNER_RULE = 'mutation-unsupported-runner';

const STRYKER_TSCONFIG_TARGET = '.nitpicker-diff-tsconfig.stryker.json';

const STRYKER_CONFIG_PATH = 'languages/typescript/preset/defaults/stryker.config.mjs';

export function runMutation(options) {
  return runScopedMutation(options, {
    layout: readLayout(),
    exceptions: readHeadPolicy().exceptions,
    mutationReport,
    normalize: normalizeMutation,
  });
}

async function mutationReport(options, targets) {
  const testRunner = projectTestRunner(options);
  const unsupported = unsupportedMutationRunner(options, testRunner.runner);
  if (unsupported !== undefined) {
    return {
      skipped: [toolErrorFinding(options, { rule: UNSUPPORTED_RUNNER_RULE, message: unsupported })],
    };
  }
  const sourceConfig = (
    await importPolicyModule(options, STRYKER_CONFIG_PATH, `?run=${Date.now().toString()}`)
  ).default;
  return targets !== undefined && configuredTargets(targets, sourceConfig.mutate).length === 0
    ? { report: { files: {} } }
    : strykerReport(options, { sourceConfig, targets, testRunner });
}

async function strykerReport(options, { sourceConfig, targets, testRunner }) {
  const configPath = path.join(options.projectRoot, '.nitpicker-diff-stryker.config.mjs');
  const createdFiles = [];
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
          readMutationReport(options.projectRoot, written.config.coverageAnalysis),
          written.config,
        ),
        options.projectRoot,
      ),
    };
  } finally {
    await Promise.all(createdFiles.map((filePath) => rm(filePath, { force: true })));
  }
}

async function runnerConfig({ options, sourceConfig, targets, createdFiles, testRunner }) {
  const { tsconfigPath, baselineErrors, native } = await installStrykerTsconfig(options, {
    sourceRelativePath: sourceConfig.tsconfigFile,
    createdFiles,
    engine: mutationCheckerEngine(targets),
  });
  function withChecker(config) {
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
    [sourceConfig.vitest?.configFile, '.nitpicker-diff-stryker.vitest.config.ts'],
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
}) {
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

export function strykerRunConfig(sourceConfig, { snapshot, targets, ...files }) {
  return {
    ...(Object.keys(files).length === 0 ? sourceConfig : rebaseMutationConfig(sourceConfig, files)),
    ...(targets === undefined ? {} : { mutate: configuredTargets(targets, sourceConfig.mutate) }),
    ...(snapshot === 'base' ? { checkers: [] } : {}),
    reporters: ['json'],
    jsonReporter: { fileName: MUTATION_REPORT_PATH },
  };
}

function runStrykerOrExplainSkip(options, configPath, command) {
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

function readMutationReport(projectRoot, coverageAnalysis) {
  return withUnreachedMutantsUncovered(
    JSON.parse(readFileSync(path.join(projectRoot, MUTATION_REPORT_PATH), 'utf8')),
    coverageAnalysis,
  );
}

export function rebaseMutationConfig(sourceConfig, { tsconfigFile, vitestConfigFile }) {
  return {
    ...sourceConfig,
    tsconfigFile,
    vitest: {
      ...sourceConfig.vitest,
      configFile: vitestConfigFile,
    },
  };
}

export async function installStrykerTsconfig(
  options,
  { sourceRelativePath, createdFiles, engine },
) {
  const target = [sourceRelativePath, STRYKER_TSCONFIG_TARGET];
  const tsconfigPath = installMutationCompanion(options, target, createdFiles);
  const strict = await mutationTypecheck({ options, tsconfigPath, engine });
  if (strict.clean) {
    return { tsconfigPath, baselineErrors: false, native: strict.native };
  }
  writeFileSync(tsconfigPath, mutationCompanionText(options, target, { strictMutants: false }));
  const relaxed = await mutationTypecheck({ options, tsconfigPath, engine });
  return { tsconfigPath, baselineErrors: !relaxed.clean, native: relaxed.native };
}

function installMutationCompanion(options, target, createdFiles) {
  const targetPath = path.join(options.projectRoot, target[1]);
  writeTemporaryFile(targetPath, mutationCompanionText(options, target), createdFiles);
  return targetPath;
}

function mutationCompanionText(options, [sourceRelativePath, targetName], transformOptions) {
  const sourcePath = policyFile(
    options.policyRoot,
    companionPath(path.posix.dirname(STRYKER_CONFIG_PATH), sourceRelativePath),
  );
  const targetPath = path.join(options.projectRoot, targetName);
  const transform = layoutTransformFor(sourceRelativePath ?? '', readLayout(), transformOptions);
  const text = readFileSync(sourcePath, 'utf8');
  return transform === undefined ? text : transform(text, targetPath);
}

function companionPath(configDirectory, relativePath) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath)
  ) {
    return relativePath;
  }
  return path.posix.join(configDirectory, relativePath.replaceAll('\\', '/'));
}

function writeTemporaryFile(filePath, contents, createdFiles) {
  if (existsSync(filePath)) {
    throw new Error(`Temporary mutation config already exists: ${filePath}`);
  }
  trackTemporaryPath(filePath);
  createdFiles.push(filePath);
  writeFileSync(filePath, contents);
}
